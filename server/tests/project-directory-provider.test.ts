process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:58080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:59099";
process.env.FIREBASE_PROJECT_ID ||= "outliner-d57b0";
process.env.GCLOUD_PROJECT ||= "outliner-d57b0";

// Regression coverage for the project-directory/access provider boundary
// (issue #5582). Every directory/ACL decision below is made by the real
// Firestore-backed producer against real emulator data: no stubbed
// allow/deny verdicts and no ALLOW_TEST_ACCESS bypass. Identity alone comes
// from the Firebase Auth emulator SDK through the router's verifier seam,
// while authorization stays with the resource-side records.

import { HocuspocusProvider } from "@hocuspocus/provider";
import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import express from "express";
import { type App, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import fs from "fs-extra";
import os from "os";
import path from "path";
import sinon from "sinon";
import request from "supertest";
import WebSocket from "ws";
import * as Y from "yjs";
import { checkContainerAccess, findAccessibleProjectIds } from "../src/access-control.js";
import { type Config, loadConfig } from "../src/config.js";
import { initializeFirebase } from "../src/firebase-init.js";
import { createDocumentStore, createPersistence } from "../src/persistence.js";
import { createProjectDirectoryRouter } from "../src/project-directory-api.js";
import {
    createFirestoreProjectDirectoryProvider,
    getProjectDirectoryProvider,
} from "../src/project-directory-provider.js";
import { startServer } from "../src/server.js";

global.WebSocket = WebSocket as any;

const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST as string;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST as string;

describe("project-directory provider boundary (real Firestore)", () => {
    const appName = "project-directory-provider-tests";
    let app: App;
    let db: Firestore;
    const projectIds = [
        "provider-plan",
        "provider-second",
        "provider-rename-live",
        "provider-rename-other",
        "provider-forged-target",
        "provider-legacy-target",
        "provider-quarantine-bad",
        "provider-quarantine-good",
        "provider-ws-room",
    ];

    async function mintIdToken(uid: string): Promise<string> {
        const auth = getAuth(app);
        try {
            await auth.createUser({ uid });
        } catch (error: unknown) {
            const code = error && typeof error === "object" && "code" in error
                ? (error as { code: string; }).code
                : undefined;
            if (code !== "auth/uid-already-exists") throw error;
        }
        const customToken = await auth.createCustomToken(uid);
        const response = await fetch(
            `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: customToken, returnSecureToken: true }),
            },
        );
        const data = await response.json() as { idToken?: string; };
        expect(data.idToken, "Auth emulator must mint a verifiable ID token").to.be.a("string");
        // Identity is established by the real Auth emulator SDK; the uid below
        // must match the minted user or the fixture is miswired.
        const decoded = await getAuth(app).verifyIdToken(data.idToken as string);
        expect(decoded.uid).to.equal(uid);
        return data.idToken as string;
    }

    function router() {
        return createProjectDirectoryRouter({
            provider: createFirestoreProjectDirectoryProvider(db),
            verifyToken: (token: string) => getAuth(app).verifyIdToken(token) as never,
        });
    }

    function appWithRouter() {
        const app = express();
        app.use(express.json());
        app.use("/api", router());
        return app;
    }

    before(async () => {
        delete process.env.ALLOW_TEST_ACCESS;
        process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
        process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
        // Other suites assign these at import time; reassert here so Firebase
        // initialization below targets this suite's emulator project.
        process.env.FIREBASE_PROJECT_ID = "outliner-d57b0";
        process.env.GCLOUD_PROJECT = "outliner-d57b0";
        app = getApps().find(candidate => candidate.name === appName)
            ?? initializeApp({ projectId: "outliner-d57b0" }, appName);
        db = getFirestore(app);
    });

    beforeEach(async () => {
        expect(process.env.ALLOW_TEST_ACCESS ?? "false").to.not.equal("true");
        await Promise.all([
            ...projectIds.map(projectId => db.collection("projectUsers").doc(projectId).delete()),
            ...projectIds.map(projectId => db.collection("containerUsers").doc(projectId).delete()),
            db.collection("userProjects").doc("provider-owner").delete(),
            db.collection("userProjects").doc("provider-intruder").delete(),
        ]);
    });

    after(async () => {
        await Promise.all([
            ...projectIds.map(projectId => db.collection("projectUsers").doc(projectId).delete()),
            ...projectIds.map(projectId => db.collection("containerUsers").doc(projectId).delete()),
            db.collection("userProjects").doc("provider-owner").delete(),
            db.collection("userProjects").doc("provider-intruder").delete(),
        ]);
        await deleteApp(app);
    });

    it("selects the Firestore producer by default without extra configuration", async () => {
        const provider = getProjectDirectoryProvider();
        expect(provider.kind).to.equal("firestore");
        await db.collection("projectUsers").doc("provider-plan").set({
            projectId: "provider-plan",
            title: "Default Producer",
            accessibleUserIds: ["provider-owner"],
        });
        // The default provider resolves the default Firestore database on its
        // own; listing through it must see the same canonical descriptor.
        const defaultDb = getFirestore(app);
        const viaDefault = await createFirestoreProjectDirectoryProvider(defaultDb)
            .listDescriptors("provider-owner");
        expect(viaDefault).to.deep.equal([{ projectId: "provider-plan", title: "Default Producer" }]);
    });

    it("registers, retries and conflicts through the production router", async () => {
        const token = await mintIdToken("provider-owner");
        const api = appWithRouter();

        const created = await request(api).post("/api/projects").set("Authorization", `Bearer ${token}`)
            .send({ projectId: "provider-plan", title: "  Local planning  " });
        expect(created.status).to.equal(201);
        expect(created.body).to.deep.equal({ projectId: "provider-plan", title: "Local planning" });

        const stored = await db.collection("projectUsers").doc("provider-plan").get();
        expect(stored.data()?.accessibleUserIds).to.deep.equal(["provider-owner"]);

        const listed = await request(api).get("/api/projects").set("Authorization", `Bearer ${token}`);
        expect(listed.status).to.equal(200);
        expect(listed.body).to.deep.equal({
            projects: [{ projectId: "provider-plan", title: "Local planning" }],
        });

        // Same normalized title: idempotent, membership and title untouched.
        const retry = await request(api).post("/api/projects").set("Authorization", `Bearer ${token}`)
            .send({ projectId: "provider-plan", title: "Local planning" });
        expect(retry.status).to.equal(201);
        expect(retry.body).to.deep.equal({ projectId: "provider-plan", title: "Local planning" });
        expect((await db.collection("projectUsers").doc("provider-plan").get()).data()?.accessibleUserIds)
            .to.deep.equal(["provider-owner"]);

        // Same ID, different title: distinct title_conflict.
        const conflict = await request(api).post("/api/projects").set("Authorization", `Bearer ${token}`)
            .send({ projectId: "provider-plan", title: "Other title" });
        expect(conflict.status).to.equal(409);

        // Same canonical title under a second ID: duplicate_title, no partial write.
        const duplicate = await request(api).post("/api/projects").set("Authorization", `Bearer ${token}`)
            .send({ projectId: "provider-second", title: "Local planning" });
        expect(duplicate.status).to.equal(409);
        expect((await db.collection("projectUsers").doc("provider-second").get()).exists).to.equal(false);

        // Invalid titles are rejected without an ID-derived fallback record.
        const invalid = await request(api).post("/api/projects").set("Authorization", `Bearer ${token}`)
            .send({ projectId: "provider-second", title: "4a934322-05de-4c97-932c-bc87fb43e18c" });
        expect(invalid.status).to.equal(400);
        expect((await db.collection("projectUsers").doc("provider-second").get()).exists).to.equal(false);
    });

    it("renames only the title and preserves document identity", async () => {
        const token = await mintIdToken("provider-owner");
        const api = appWithRouter();
        await db.collection("projectUsers").doc("provider-rename-live").set({
            projectId: "provider-rename-live",
            title: "Before",
            accessibleUserIds: ["provider-owner"],
        });
        await db.collection("projectUsers").doc("provider-rename-other").set({
            projectId: "provider-rename-other",
            title: "Reserved",
            accessibleUserIds: ["provider-owner"],
        });

        // Live Yjs state is held in the production SQLite persistence, exactly
        // as the running server wires it, so unloading and reopening the room
        // proves the rename preserved the document.
        const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-rename-docs-"));
        const persistence = await createPersistence({ DATABASE_PATH: docDir } as Config);
        const hocuspocus = new Hocuspocus({ extensions: persistence ? [persistence] : [] });
        const storeDocument = persistence ? createDocumentStore(persistence) : undefined;
        expect(storeDocument, "production persistence must be available").to.be.a("function");
        const first = await (hocuspocus as unknown as {
            openDirectConnection: (room: string, opts: unknown) => Promise<
                {
                    document: Y.Doc;
                    transact: (fn: (doc: Y.Doc) => void) => Promise<void>;
                    disconnect: () => Promise<void>;
                }
            >;
        }).openDirectConnection("projects/provider-rename-live", { context: { uid: "provider-owner" } });
        await first.transact((doc: Y.Doc) => {
            doc.getText("content").insert(0, "live document state");
        });
        await storeDocument!("projects/provider-rename-live", first.document as unknown as Y.Doc);
        const before = Y.encodeStateAsUpdate(first.document);
        await first.disconnect();

        const renamed = await request(api).post("/api/projects/provider-rename-live/rename")
            .set("Authorization", `Bearer ${token}`).send({ title: "After" });
        expect(renamed.status).to.equal(200);
        expect(renamed.body).to.deep.equal({ projectId: "provider-rename-live", title: "After" });

        const second = await (hocuspocus as unknown as {
            openDirectConnection: (room: string, opts: unknown) => Promise<
                {
                    document: Y.Doc;
                    transact: (fn: (doc: Y.Doc) => void) => Promise<void>;
                    disconnect: () => Promise<void>;
                }
            >;
        }).openDirectConnection("projects/provider-rename-live", { context: { uid: "provider-owner" } });
        expect(Y.encodeStateAsUpdate(second.document)).to.deep.equal(before);
        await second.disconnect();
        (persistence as unknown as { db?: { close: () => void; }; }).db?.close();
        await fs.remove(docDir);

        const stored = (await db.collection("projectUsers").doc("provider-rename-live").get()).data();
        expect(stored).to.include({ projectId: "provider-rename-live", title: "After" });
        expect(stored?.accessibleUserIds).to.deep.equal(["provider-owner"]);

        // Renaming onto the second project's title fails without touching either.
        const clash = await request(api).post("/api/projects/provider-rename-live/rename")
            .set("Authorization", `Bearer ${token}`).send({ title: "Reserved" });
        expect(clash.status).to.equal(409);
        expect((await db.collection("projectUsers").doc("provider-rename-live").get()).data()?.title)
            .to.equal("After");
        expect((await db.collection("projectUsers").doc("provider-rename-other").get()).data()?.title)
            .to.equal("Reserved");

        // Retrying the old registration does not rename it back.
        const stale = await request(api).post("/api/projects").set("Authorization", `Bearer ${token}`)
            .send({ projectId: "provider-rename-live", title: "Before" });
        expect(stale.status).to.equal(409);
        expect((await db.collection("projectUsers").doc("provider-rename-live").get()).data()?.title)
            .to.equal("After");
    });

    it("denies forged user-side membership while honoring legacy resource access", async () => {
        const ownerToken = await mintIdToken("provider-owner");
        const intruderToken = await mintIdToken("provider-intruder");
        const api = appWithRouter();

        await db.collection("projectUsers").doc("provider-forged-target").set({
            projectId: "provider-forged-target",
            title: "Real Project",
            accessibleUserIds: ["provider-owner"],
        });
        await db.collection("userProjects").doc("provider-intruder").set({
            accessibleProjectIds: ["provider-forged-target"],
            projectTitles: { "provider-forged-target": "Real Project" },
        });
        await db.collection("containerUsers").doc("provider-legacy-target").set({
            accessibleUserIds: ["provider-intruder"],
        });

        // The production access caller grants nothing from user-side caches.
        expect(await checkContainerAccess("provider-intruder", "provider-forged-target", db)).to.equal(false);
        expect(await findAccessibleProjectIds("provider-intruder", db)).to.not.include("provider-forged-target");

        // Directory resolution and listing stay denied for the forged uid.
        const resolve = await request(api).get("/api/projects/resolve").query({ title: "Real Project" })
            .set("Authorization", `Bearer ${intruderToken}`);
        expect(resolve.status).to.equal(404);
        const listed = await request(api).get("/api/projects").set("Authorization", `Bearer ${intruderToken}`);
        expect(listed.body.projects.map((entry: { projectId: string; }) => entry.projectId))
            .to.not.include("provider-forged-target");

        // Legacy resource-side membership still permits the access path ...
        expect(await checkContainerAccess("provider-intruder", "provider-legacy-target", db)).to.equal(true);
        expect(await findAccessibleProjectIds("provider-intruder", db)).to.include("provider-legacy-target");
        // ... without fabricating a canonical project title for it.
        const legacyListed = await request(api).get("/api/projects")
            .set("Authorization", `Bearer ${intruderToken}`);
        expect(
            legacyListed.body.projects.map((entry: { projectId: string; }) => entry.projectId),
        ).to.not.include("provider-legacy-target");

        // The owner keeps canonical access throughout.
        expect(await checkContainerAccess("provider-owner", "provider-forged-target", db)).to.equal(true);
        const ownerResolve = await request(api).get("/api/projects/resolve").query({ title: "Real Project" })
            .set("Authorization", `Bearer ${ownerToken}`);
        expect(ownerResolve.status).to.equal(200);
        expect(ownerResolve.body).to.deep.equal({ projectId: "provider-forged-target", title: "Real Project" });
    });

    it("quarantines a malformed title without hiding valid descriptors", async () => {
        const token = await mintIdToken("provider-owner");
        const api = appWithRouter();
        await Promise.all([
            db.collection("projectUsers").doc("provider-quarantine-bad").set({
                title: "123e4567-e89b-12d3-a456-426614174000",
                accessibleUserIds: ["provider-owner"],
            }),
            db.collection("projectUsers").doc("provider-quarantine-good").set({
                title: "Kept",
                accessibleUserIds: ["provider-owner"],
            }),
        ]);
        const listed = await request(api).get("/api/projects").set("Authorization", `Bearer ${token}`);
        expect(listed.status).to.equal(200);
        expect(listed.body).to.deep.equal({
            projects: [{ projectId: "provider-quarantine-good", title: "Kept" }],
        });
    });

    it("fails closed on storage errors without reporting empty success", async () => {
        const token = await mintIdToken("provider-owner");
        // Simulate an unavailable Firestore transport on the real database
        // object: every collection access throws, as with a refused
        // connection, without stubbing any access decision itself.
        const collectionStub = sinon.stub(db, "collection").throws(new Error("Firestore unavailable"));
        const failingProvider = createFirestoreProjectDirectoryProvider(db);
        try {
            // A storage failure must surface as a failure, never as an empty list.
            try {
                await failingProvider.listDescriptors("provider-owner");
                expect.fail("expected canonical directory read to fail when Firestore is unavailable");
            } catch (error) {
                expect(error).to.not.be.an("AssertionError");
            }
            const api = express();
            api.use(express.json());
            api.use(
                "/api",
                createProjectDirectoryRouter({
                    provider: failingProvider,
                    verifyToken: (candidate: string) => getAuth(app).verifyIdToken(candidate) as never,
                }),
            );
            const listed = await request(api).get("/api/projects").set("Authorization", `Bearer ${token}`);
            expect(listed.status).to.equal(500);

            // The compatibility facades deny without granting, but that
            // denied/empty fallback is not a canonical-directory success.
            expect(await checkContainerAccess("provider-owner", "provider-plan", db)).to.equal(false);
            expect(await findAccessibleProjectIds("provider-owner", db)).to.deep.equal([]);
        } finally {
            collectionStub.restore();
        }
    });

    it("authorizes real WebSocket rooms through the default production wiring", async () => {
        delete process.env.ALLOW_TEST_ACCESS;
        process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
        await initializeFirebase();
        const defaultDb = getFirestore();
        const roomId = "provider-ws-room";
        await defaultDb.collection("projectUsers").doc(roomId).set({
            projectId: roomId,
            title: "Socket Project",
            accessibleUserIds: ["provider-owner"],
        });

        const ownerAuth = getAuth();
        try {
            await ownerAuth.createUser({ uid: "provider-owner" });
        } catch (error: unknown) {
            const code = error && typeof error === "object" && "code" in error
                ? (error as { code: string; }).code
                : undefined;
            if (code !== "auth/uid-already-exists") throw error;
        }
        try {
            await ownerAuth.createUser({ uid: "provider-intruder-ws" });
        } catch (error: unknown) {
            const code = error && typeof error === "object" && "code" in error
                ? (error as { code: string; }).code
                : undefined;
            if (code !== "auth/uid-already-exists") throw error;
        }
        const signIn = async (uid: string): Promise<string> => {
            const customToken = await ownerAuth.createCustomToken(uid);
            const response = await fetch(
                `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
                },
            );
            const data = await response.json() as { idToken: string; };
            return data.idToken;
        };
        const ownerToken = await signIn("provider-owner");
        const intruderToken = await signIn("provider-intruder-ws");

        // No access override: the server must use the default Firestore
        // provider for its Hocuspocus authorization path. Identity comes from
        // the real Firebase Auth emulator SDK through the verifier seam (the
        // emulator mints unsigned tokens, which the production token verifier
        // rightly rejects); every allow/deny decision stays with the
        // resource-side Firestore records.
        const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-ws-test-"));
        const config = loadConfig({ PORT: "0", LOG_LEVEL: "error", DATABASE_PATH: dbDir });
        const started = await startServer(config, undefined, {
            verifyIdTokenCached: (token: string) => getAuth().verifyIdToken(token),
        });
        const httpServer = started.server;
        const shutdown = started.shutdown;
        await new Promise<void>(resolve => {
            if (httpServer.listening) resolve();
            else httpServer.on("listening", resolve);
        });
        const port = (httpServer.address() as { port: number; }).port;

        const connect = (idToken: string) =>
            new HocuspocusProvider({
                url: `ws://127.0.0.1:${port}/projects/${roomId}?token=${idToken}`,
                name: `projects/${roomId}`,
                document: new Y.Doc(),
                token: idToken,
            });
        const awaitSynced = (provider: HocuspocusProvider) =>
            new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Timed out waiting for sync")), 10000);
                provider.on("synced", () => {
                    clearTimeout(timeout);
                    resolve();
                });
                provider.on("authenticationFailed", () => {
                    clearTimeout(timeout);
                    reject(new Error("Authentication failed for an authorized member"));
                });
            });
        const awaitDenied = (provider: HocuspocusProvider) =>
            new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    provider.disconnect();
                    reject(new Error("Timed out waiting for access denial"));
                }, 10000);
                provider.on("authenticationFailed", () => {
                    clearTimeout(timeout);
                    provider.disconnect();
                    resolve();
                });
                provider.on("disconnect", () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

        // Sanity: the server under test really is using the default provider.
        expect(getProjectDirectoryProvider().kind).to.equal("firestore");

        const member = connect(ownerToken);
        await awaitSynced(member);
        member.disconnect();
        member.destroy();

        const intruder = connect(intruderToken);
        await awaitDenied(intruder);
        intruder.destroy();

        await shutdown();
        await fs.remove(dbDir);
        await defaultDb.collection("projectUsers").doc(roomId).delete();
    });
});
