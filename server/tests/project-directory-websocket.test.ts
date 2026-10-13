process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:58080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:59099";
process.env.FIREBASE_PROJECT_ID ||= "outliner-d57b0";
process.env.GCLOUD_PROJECT ||= "outliner-d57b0";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect } from "chai";
import { type App, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { type Firestore as FirestoreType, getFirestore } from "firebase-admin/firestore";
import fs from "fs-extra";
import os from "os";
import path from "path";
import WebSocket from "ws";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { firebaseState, initializeFirebase } from "../src/firebase-init.js";
import { createFirestoreProjectDirectoryProvider } from "../src/project-directory-provider.js";
import { startServer } from "../src/server.js";

(globalThis as unknown as { WebSocket: unknown; }).WebSocket = WebSocket as unknown;

// Production WebSocket authorization through the default provider wiring
// (issue #5582, REQ-008). startServer is invoked WITHOUT a
// checkContainerAccess override, so the onAuthenticate caller must use the
// default provider-backed access function against real Firestore data. No
// predetermined allow/deny oracle and no ALLOW_TEST_ACCESS bypass are used.
describe("project directory production websocket authorization (real Firestore)", () => {
    const appName = "project-directory-websocket-tests";
    let app: App;
    let db: FirestoreType;
    let httpServer: { address: () => unknown; listening: boolean; on: (event: string, fn: () => void) => void; };
    let shutdown: () => Promise<void>;
    let hocuspocus: { openDirectConnection: (room: string) => Promise<DirectConnection>; };
    let dbDir: string;
    let port: number;
    let savedAllowTestAccess: string | undefined;
    let savedLocalPassword: string | undefined;
    let savedLocalDataDir: string | undefined;
    const providers: HocuspocusProvider[] = [];

    const OWNER_UID = "ws-owner";
    const LEGACY_UID = "ws-legacy-member";
    const STRANGER_UID = "ws-stranger";

    const TOKENS: Record<string, string> = {
        "ws-owner-token": OWNER_UID,
        "ws-legacy-token": LEGACY_UID,
        "ws-stranger-token": STRANGER_UID,
    };

    async function stubVerifyToken(token: string): Promise<{ uid: string; }> {
        const uid = TOKENS[token];
        if (!uid) throw new Error("Invalid token");
        return { uid };
    }

    interface DirectConnection {
        document: Y.Doc;
        transact: (fn: (doc: Y.Doc) => void) => Promise<void>;
        disconnect: () => Promise<void>;
    }

    function connect(room: string, token: string): HocuspocusProvider {
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/${room}?token=${token}`,
            name: room,
            document: new Y.Doc(),
            token,
        });
        providers.push(provider);
        return provider;
    }

    function expectSync(provider: HocuspocusProvider): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Timed out waiting for sync"));
            }, 8000);
            provider.on("synced", () => {
                clearTimeout(timeout);
                resolve();
            });
            provider.on("authenticationFailed", () => {
                clearTimeout(timeout);
                reject(new Error("Expected sync but authentication failed"));
            });
        });
    }

    function expectAuthFailure(provider: HocuspocusProvider): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Timed out waiting for auth failure"));
            }, 8000);
            provider.on("authenticationFailed", () => {
                clearTimeout(timeout);
                resolve();
            });
            provider.on("disconnect", () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    before(async function() {
        this.timeout(60000);
        process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:58080";
        process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:59099";
        process.env.FIREBASE_PROJECT_ID = "outliner-d57b0";
        process.env.GCLOUD_PROJECT = "outliner-d57b0";
        savedAllowTestAccess = process.env.ALLOW_TEST_ACCESS;
        savedLocalPassword = process.env.OUTLINER_LOCAL_PASSWORD;
        savedLocalDataDir = process.env.OUTLINER_DATA_DIR;
        delete process.env.ALLOW_TEST_ACCESS;
        // Inactive local settings must not alter the default cloud
        // composition's real resource-side authorization outcomes.
        process.env.OUTLINER_LOCAL_PASSWORD = "inactive-cloud-local-password";
        process.env.OUTLINER_DATA_DIR = path.join(os.tmpdir(), "inactive-cloud-local-data");
        // The production onAuthenticate hook requires Firebase readiness.
        if (firebaseState !== "ready") await initializeFirebase();
        expect(firebaseState).to.equal("ready");
        expect(process.env.ALLOW_TEST_ACCESS).to.not.equal("true");

        app = getApps().find(candidate => candidate.name === appName)
            ?? initializeApp({ projectId: "outliner-d57b0" }, appName);
        db = getFirestore(app);

        // Canonical resource-side membership, legacy resource-side
        // membership, and a forged user-side cache with no resource grant.
        await Promise.all([
            db.collection("projectUsers").doc("ws-private").set({
                projectId: "ws-private",
                title: "Private Room",
                accessibleUserIds: [OWNER_UID],
            }),
            db.collection("containerUsers").doc("ws-legacy-room").set({
                accessibleUserIds: [LEGACY_UID],
            }),
            db.collection("userProjects").doc(OWNER_UID).set({
                accessibleProjectIds: ["ws-forged"],
                projectTitles: { "ws-forged": "Forged" },
            }),
        ]);

        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-directory-test-"));
        const config = loadConfig({
            PORT: "0",
            LOG_LEVEL: "info",
            DATABASE_PATH: dbDir,
            OUTLINER_LOCAL_PASSWORD: process.env.OUTLINER_LOCAL_PASSWORD,
            OUTLINER_DATA_DIR: process.env.OUTLINER_DATA_DIR,
        });
        expect(config.OUTLINER_DEPLOYMENT_MODE).to.equal("cloud");
        // Production-shaped wiring: a token verifier override for stable
        // test identities, the real Firestore-backed directory, and the
        // DEFAULT access function (no checkContainerAccess override, so the
        // startServer default branch is what onAuthenticate executes).
        const started = await startServer(config, undefined, {
            verifyIdTokenCached: stubVerifyToken as never,
            directory: createFirestoreProjectDirectoryProvider(db),
        });
        hocuspocus = started.hocuspocus as unknown as typeof hocuspocus;
        httpServer = started.server as unknown as typeof httpServer;
        shutdown = started.shutdown;

        await new Promise<void>(resolve => {
            if (httpServer.listening) resolve();
            else httpServer.on("listening", resolve);
        });
        port = (httpServer.address() as { port: number; }).port;
        await new Promise(resolve => setTimeout(resolve, 500));

        const seed = await hocuspocus.openDirectConnection("projects/ws-private");
        await seed.transact(doc => {
            doc.getText("probe").insert(0, "secret-content");
        });
        await seed.disconnect();
        const legacySeed = await hocuspocus.openDirectConnection("projects/ws-legacy-room");
        await legacySeed.transact(doc => {
            doc.getText("probe").insert(0, "legacy-content");
        });
        await legacySeed.disconnect();
    });

    afterEach(() => {
        for (const provider of providers.splice(0)) {
            try {
                provider.destroy();
            } catch {
                // Destroy is best-effort cleanup between cases.
            }
        }
    });

    after(async () => {
        if (db) {
            await Promise.all([
                db.collection("projectUsers").doc("ws-private").delete().catch(() => undefined),
                db.collection("containerUsers").doc("ws-legacy-room").delete().catch(() => undefined),
                db.collection("userProjects").doc(OWNER_UID).delete().catch(() => undefined),
            ]);
        }
        if (shutdown) await shutdown();
        if (dbDir) await fs.remove(dbDir);
        if (savedAllowTestAccess === undefined) delete process.env.ALLOW_TEST_ACCESS;
        else process.env.ALLOW_TEST_ACCESS = savedAllowTestAccess;
        if (savedLocalPassword === undefined) delete process.env.OUTLINER_LOCAL_PASSWORD;
        else process.env.OUTLINER_LOCAL_PASSWORD = savedLocalPassword;
        if (savedLocalDataDir === undefined) delete process.env.OUTLINER_DATA_DIR;
        else process.env.OUTLINER_DATA_DIR = savedLocalDataDir;
        if (app) await deleteApp(app);
    });

    it("synchronizes a canonically authorized project through production onAuthenticate", async () => {
        const provider = connect("projects/ws-private", "ws-owner-token");
        await expectSync(provider);
        expect(provider.document.getText("probe").toString()).to.equal("secret-content");
    });

    it("synchronizes a legacy-authorized project without a canonical descriptor", async () => {
        const provider = connect("projects/ws-legacy-room", "ws-legacy-token");
        await expectSync(provider);
        expect(provider.document.getText("probe").toString()).to.equal("legacy-content");
    });

    it("rejects a nonmember through production onAuthenticate", async () => {
        const provider = connect("projects/ws-private", "ws-stranger-token");
        await expectAuthFailure(provider);
    });

    it("rejects forged user-side membership through production onAuthenticate", async () => {
        const provider = connect("projects/ws-forged", "ws-owner-token");
        await expectAuthFailure(provider);
    });
});
