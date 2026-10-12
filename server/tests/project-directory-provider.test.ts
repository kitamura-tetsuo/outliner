process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:58080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:59099";
process.env.FIREBASE_PROJECT_ID ||= "outliner-d57b0";
process.env.GCLOUD_PROJECT ||= "outliner-d57b0";

import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import express from "express";
import { type App, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { type Firestore as FirestoreType, getFirestore } from "firebase-admin/firestore";
import request from "supertest";
import * as Y from "yjs";
import { createProjectDirectoryRouter } from "../src/project-directory-api.js";
import {
    createFirestoreProjectDirectoryProvider,
    getDefaultProjectDirectoryProvider,
    resolveProjectDirectoryProvider,
} from "../src/project-directory-provider.js";
import { ProjectDirectoryError } from "../src/project-directory.js";
import { verifyIdTokenCached } from "../src/websocket-auth.js";

// Regression coverage for the project-directory/access provider boundary
// (issue #5582). The production directory router and the production
// WebSocket access caller (the provider checkAccess wired into
// Hocuspocus onAuthenticate in server.ts) run against real Firestore
// emulator data. No predetermined allow/deny oracle and no
// ALLOW_TEST_ACCESS bypass is used anywhere in this suite.
describe("project directory provider boundary (real Firestore)", () => {
    const appName = "project-directory-provider-tests";
    let app: App;
    let db: FirestoreType;
    let ownerToken: string;
    let otherToken: string;
    let ownerUid: string;
    let otherUid: string;
    const projectIds = [
        "provider-plan",
        "provider-first",
        "provider-second",
        "provider-forged",
        "provider-legacy",
        "provider-bad-title",
        "provider-uuid-title",
    ];

    async function mintIdentity(email: string): Promise<{ uid: string; idToken: string; }> {
        const response = await fetch(
            `http://127.0.0.1:59099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password: "provider-test-password", returnSecureToken: true }),
            },
        );
        if (!response.ok) {
            throw new Error(`Auth emulator sign-up failed: ${response.status} ${await response.text()}`);
        }
        const body = await response.json() as { localId?: string; idToken?: string; };
        if (!body.localId || !body.idToken) throw new Error("Auth emulator returned no identity");
        return { uid: body.localId, idToken: body.idToken };
    }

    // Verifier seam for cloud provider/routing tests: the Auth emulator only
    // mints unsigned (alg:none) tokens, which the production verifier rightly
    // rejects outside explicit test-access mode. This seam establishes the
    // identity through the actual Firebase Auth emulator SDK (the uid must
    // exist there) while the real Firestore-backed ACL remains enabled. It
    // proves routing and metadata authority, not production token
    // cryptography; dedicated token/security suites cover the latter.
    async function emulatorIdentityVerifier(token: string): Promise<{ uid: string; }> {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Malformed token");
        let payload: { sub?: string; user_id?: string; };
        try {
            payload = JSON.parse(Buffer.from(parts[1]!, "base64").toString()) as typeof payload;
        } catch {
            throw new Error("Malformed token");
        }
        const uid = payload.user_id || payload.sub;
        if (!uid) throw new Error("Token carries no uid");
        const user = await getAuth(app).getUser(uid);
        return { uid: user.uid };
    }

    function buildApp() {
        const app = express();
        app.use(express.json());
        // Production-shaped wiring: a Firebase verifier at the auth boundary
        // and the real Firestore-backed provider for every directory/ACL call.
        // No predetermined allow/deny oracle and no ALLOW_TEST_ACCESS bypass.
        app.use(
            "/api",
            createProjectDirectoryRouter({
                verifyToken: emulatorIdentityVerifier as never,
                directory: createFirestoreProjectDirectoryProvider(db),
            }),
        );
        return app;
    }

    before(async () => {
        process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:58080";
        process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:59099";
        process.env.FIREBASE_PROJECT_ID = "outliner-d57b0";
        process.env.GCLOUD_PROJECT = "outliner-d57b0";
        delete process.env.ALLOW_TEST_ACCESS;
        app = getApps().find(candidate => candidate.name === appName)
            ?? initializeApp({ projectId: "outliner-d57b0" }, appName);
        db = getFirestore(app);
        const owner = await mintIdentity("provider-owner@example.com");
        const other = await mintIdentity("provider-other@example.com");
        ownerUid = owner.uid;
        otherUid = other.uid;
        ownerToken = owner.idToken;
        otherToken = other.idToken;
        // The identity seam resolves through the Auth emulator SDK.
        expect((await emulatorIdentityVerifier(ownerToken)).uid).to.equal(ownerUid);
        // Production token validation is not weakened: unsigned emulator
        // tokens stay rejected outside explicit test-access mode, and the
        // global access bypass stays disabled.
        await verifyIdTokenCached(ownerToken).then(
            () => expect.fail("production verifier must reject unsigned emulator tokens"),
            (error: unknown) => expect((error as Error).message).to.contain("alg:none"),
        );
        expect(process.env.ALLOW_TEST_ACCESS).to.not.equal("true");
    });

    beforeEach(async () => {
        await Promise.all([
            ...projectIds.map(projectId => db.collection("projectUsers").doc(projectId).delete()),
            db.collection("containerUsers").doc("provider-legacy").delete(),
            db.collection("userProjects").doc(ownerUid).delete(),
            db.collection("userProjects").doc(otherUid).delete(),
        ]);
    });

    after(async () => {
        await Promise.all([
            ...projectIds.map(projectId =>
                db.collection("projectUsers").doc(projectId).delete().catch(() => undefined)
            ),
            db.collection("containerUsers").doc("provider-legacy").delete().catch(() => undefined),
            db.collection("userProjects").doc(ownerUid).delete().catch(() => undefined),
        ]);
        await deleteApp(app);
    });

    it("selects the Firestore provider by default without local configuration", () => {
        expect(resolveProjectDirectoryProvider().kind).to.equal("firestore");
        expect(getDefaultProjectDirectoryProvider().kind).to.equal("firestore");
        expect(() => resolveProjectDirectoryProvider("local-sqlite")).to.throw(
            "Unsupported project directory provider",
        );
    });

    it("registers, lists and retries a canonical descriptor through the production router", async () => {
        const app = buildApp();
        const created = await request(app).post("/api/projects")
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ projectId: "provider-plan", title: "  Local planning  " });
        expect(created.status).to.equal(201);
        expect(created.body).to.deep.equal({ projectId: "provider-plan", title: "Local planning" });

        const stored = (await db.collection("projectUsers").doc("provider-plan").get()).data();
        expect(stored?.accessibleUserIds).to.deep.equal([ownerUid]);
        expect(stored?.title).to.equal("Local planning");

        const listed = await request(app).get("/api/projects")
            .set("Authorization", `Bearer ${ownerToken}`);
        expect(listed.status).to.equal(200);
        expect(listed.body).to.deep.equal({ projects: [{ projectId: "provider-plan", title: "Local planning" }] });

        const before = await db.collection("projectUsers").doc("provider-plan").get();
        const retried = await request(app).post("/api/projects")
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ projectId: "provider-plan", title: "Local planning" });
        expect(retried.status).to.equal(201);
        expect(retried.body).to.deep.equal({ projectId: "provider-plan", title: "Local planning" });
        const after = await db.collection("projectUsers").doc("provider-plan").get();
        expect(after.data()?.accessibleUserIds).to.deep.equal(before.data()?.accessibleUserIds);
        expect(after.data()?.title).to.equal("Local planning");

        const conflictTitle = await request(app).post("/api/projects")
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ projectId: "provider-plan", title: "Renamed" });
        expect(conflictTitle.status).to.equal(409);

        const duplicateTitle = await request(app).post("/api/projects")
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ projectId: "provider-second", title: "Local planning" });
        expect(duplicateTitle.status).to.equal(409);
        expect((await db.collection("projectUsers").doc("provider-second").get()).exists).to.equal(false);
    });

    it("renames only the title and preserves membership and Yjs document state", async () => {
        const app = buildApp();
        const directory = createFirestoreProjectDirectoryProvider(db);
        await directory.ensureDescriptor(ownerUid, "provider-first", "Before");
        await directory.ensureDescriptor(ownerUid, "provider-second", "Reserved");

        const hocuspocus = new Hocuspocus({ name: "provider-rename-probe" });
        const connection = await (hocuspocus as unknown as {
            openDirectConnection: (room: string, opts?: unknown) => Promise<
                {
                    document: Y.Doc;
                    transact: (fn: (doc: Y.Doc) => void) => Promise<void>;
                    disconnect: () => Promise<void>;
                }
            >;
        }).openDirectConnection("projects/provider-first");
        await connection.transact(doc => {
            doc.getText("probe").insert(0, "hello-rename");
        });
        const stateBefore = Buffer.from(Y.encodeStateAsUpdate(connection.document)).toString("base64");

        const renamed = await request(app).post("/api/projects/provider-first/rename")
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ title: "After" });
        expect(renamed.status).to.equal(200);
        expect(renamed.body).to.deep.equal({ projectId: "provider-first", title: "After" });

        const stateAfter = Buffer.from(Y.encodeStateAsUpdate(connection.document)).toString("base64");
        expect(stateAfter).to.equal(stateBefore);
        expect(connection.document.getText("probe").toString()).to.equal("hello-rename");
        await connection.disconnect();

        const stored = (await db.collection("projectUsers").doc("provider-first").get()).data();
        expect(stored?.accessibleUserIds).to.deep.equal([ownerUid]);

        const duplicate = await request(app).post("/api/projects/provider-first/rename")
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ title: "Reserved" });
        expect(duplicate.status).to.equal(409);
        expect((await db.collection("projectUsers").doc("provider-first").get()).data()?.title).to.equal("After");

        const retryOld = await request(app).post("/api/projects")
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ projectId: "provider-first", title: "Before" });
        expect(retryOld.status).to.equal(409);
        expect((await db.collection("projectUsers").doc("provider-first").get()).data()?.title).to.equal("After");
    });

    it("denies forged user-side membership while honoring legacy resource access without a canonical title", async () => {
        const app = buildApp();
        const directory = createFirestoreProjectDirectoryProvider(db);
        // Forged user-side cache with no resource-side membership.
        await db.collection("userProjects").doc(ownerUid).set({
            accessibleProjectIds: ["provider-forged"],
            projectTitles: { "provider-forged": "Forged" },
        });
        // Legacy resource-side membership without a canonical descriptor.
        await db.collection("containerUsers").doc("provider-legacy").set({
            accessibleUserIds: [ownerUid],
        });
        // Malformed canonical title alongside a valid descriptor.
        await db.collection("projectUsers").doc("provider-uuid-title").set({
            projectId: "provider-uuid-title",
            title: "00000000-0000-0000-0000-000000000000",
            accessibleUserIds: [ownerUid],
        });
        await directory.ensureDescriptor(ownerUid, "provider-plan", "Kept");

        const resolveForged = await request(app).get("/api/projects/resolve")
            .set("Authorization", `Bearer ${ownerToken}`)
            .query({ title: "Forged" });
        expect(resolveForged.status).to.equal(404);

        // Production WebSocket access caller: same provider checkAccess that
        // Hocuspocus onAuthenticate uses in server.ts.
        expect(await directory.checkAccess(ownerUid, "provider-forged")).to.equal(false);
        expect(await directory.checkAccess(ownerUid, "provider-legacy")).to.equal(true);
        expect(await directory.findAccessibleIds(ownerUid)).to.not.include("provider-forged");
        expect(await directory.findAccessibleIds(ownerUid)).to.include("provider-legacy");

        const legacyDescriptor = await request(app).get("/api/projects/provider-legacy")
            .set("Authorization", `Bearer ${ownerToken}`);
        expect(legacyDescriptor.status).to.equal(404);

        const listed = await request(app).get("/api/projects")
            .set("Authorization", `Bearer ${ownerToken}`);
        expect(listed.status).to.equal(200);
        expect(listed.body).to.deep.equal({ projects: [{ projectId: "provider-plan", title: "Kept" }] });
    });

    it("rejects invalid titles and missing identity without writes", async () => {
        const app = buildApp();
        const invalid = await request(app).post("/api/projects")
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ projectId: "provider-plan", title: "4a934322-05de-4c97-932c-bc87fb43e18c" });
        expect(invalid.status).to.equal(400);
        expect((await db.collection("projectUsers").doc("provider-plan").get()).exists).to.equal(false);

        const anonymous = await request(app).get("/api/projects");
        expect(anonymous.status).to.equal(401);

        const malformed = await request(app).get("/api/projects")
            .set("Authorization", "Bearer not-a-token");
        expect(malformed.status).to.equal(401);

        const ghostPayload = Buffer.from(JSON.stringify({ sub: "ghost-uid" })).toString("base64");
        const ghost = await request(app).get("/api/projects")
            .set("Authorization", `Bearer e30.${ghostPayload}.e30`);
        expect(ghost.status).to.equal(401);

        const forbidden = await request(app).get("/api/projects/provider-plan")
            .set("Authorization", `Bearer ${otherToken}`);
        expect(forbidden.status).to.equal(404);
    });

    it("fails closed on storage errors without reporting an empty canonical directory", async () => {
        // Simulated transport outage: every Firestore entry point throws, so
        // the real provider, router and access-control paths above it must
        // fail closed instead of reporting an empty canonical directory.
        const outage = new Error("simulated Firestore outage");
        const unreachable = {
            collection: () => {
                throw outage;
            },
            runTransaction: () => {
                throw outage;
            },
        } as never;
        const directory = createFirestoreProjectDirectoryProvider(unreachable);
        await directory.listDescriptors(ownerUid).then(
            () => expect.fail("canonical reads must fail when storage is unavailable"),
            (error: unknown) => expect(error).to.equal(outage),
        );
        await directory.resolveTitle(ownerUid, "Restored").then(
            () => expect.fail("title resolution must fail when storage is unavailable"),
            (error: unknown) => expect(error).to.equal(outage),
        );
        await directory.ensureDescriptor(ownerUid, "provider-plan", "Restored").then(
            () => expect.fail("writes must fail when storage is unavailable"),
            (error: unknown) => expect(error).to.equal(outage),
        );
        // Production WebSocket access caller fails closed: no access grant
        // and no accessible IDs from an unreachable store.
        expect(await directory.checkAccess(ownerUid, "provider-plan")).to.equal(false);
        expect(await directory.findAccessibleIds(ownerUid)).to.deep.equal([]);
        // With Firestore restored the same stored records stay readable.
        const restored = createFirestoreProjectDirectoryProvider(db);
        await restored.ensureDescriptor(ownerUid, "provider-plan", "Restored");
        expect(await restored.listDescriptors(ownerUid)).to.deep.equal([
            { projectId: "provider-plan", title: "Restored" },
        ]);
    });

    it("keeps provider failures distinguishable from directory success", async () => {
        const quarantined: ProjectDirectoryError[] = [];
        const directory = createFirestoreProjectDirectoryProvider(db);
        await db.collection("projectUsers").doc("provider-bad-title").set({
            projectId: "provider-bad-title",
            title: "",
            accessibleUserIds: [ownerUid],
        });
        await directory.ensureDescriptor(ownerUid, "provider-plan", "Valid");
        expect(await directory.listDescriptors(ownerUid, error => quarantined.push(error))).to.deep.equal([
            { projectId: "provider-plan", title: "Valid" },
        ]);
        expect(quarantined).to.have.length(1);
        expect(quarantined[0]?.code).to.equal("invalid_title");
    });
});
