process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:58080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:59099";
process.env.FIREBASE_PROJECT_ID ||= "outliner-d57b0";
process.env.GCLOUD_PROJECT ||= "outliner-d57b0";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect } from "chai";
import { getFirestore } from "firebase-admin/firestore";
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import * as Y from "yjs";
import { initializeFirebase } from "../src/firebase-init.js";
import { unusedPort, waitFor } from "./onprem-production-fixture.js";

describe("production entrypoint cloud-default isolation", () => {
    let token: string;
    let uid: string;
    const children: ChildProcess[] = [];
    const providers: HocuspocusProvider[] = [];

    before(async function() {
        this.timeout(30000);
        await initializeFirebase();
        const signup = await fetch(
            `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
        );
        const identity = await signup.json() as { idToken: string; localId: string; };
        token = identity.idToken;
        uid = identity.localId;
        await getFirestore().collection("projectUsers").doc("cloud-entry-project").set({
            projectId: "cloud-entry-project",
            title: "Cloud Entry Project",
            accessibleUserIds: [uid],
        });
    });

    afterEach(async () => {
        for (const provider of providers.splice(0)) provider.destroy();
        for (const child of children.splice(0)) {
            if (child.exitCode === null) child.kill("SIGTERM");
            if (child.exitCode === null) await new Promise(resolve => child.once("exit", resolve));
        }
    });

    after(async () => {
        await getFirestore().collection("projectUsers").doc("cloud-entry-project").delete();
    });

    for (const deploymentMode of [undefined, "cloud"] as const) {
        it(`keeps Firebase ACL authority when mode is ${deploymentMode ?? "unset"}`, async function() {
            this.timeout(30000);
            const port = await unusedPort();
            const databasePath = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-entry-"));
            const env: NodeJS.ProcessEnv = {
                ...process.env,
                NODE_ENV: "production",
                PORT: String(port),
                DATABASE_PATH: databasePath,
                OUTLINER_LOCAL_PASSWORD: `inactive-${deploymentMode ?? "unset"}`,
                OUTLINER_DATA_DIR: path.join(databasePath, "inactive-local"),
                ALLOW_ALL_ORIGINS: "true",
                DISABLE_JOB_SCHEDULER: "true",
                VITE_FIREBASE_API_KEY: "emulator-key",
                VITE_FIREBASE_AUTH_DOMAIN: "outliner-d57b0.firebaseapp.com",
                VITE_FIREBASE_PROJECT_ID: "outliner-d57b0",
                VITE_FIREBASE_APP_ID: "1:0:web:emulator",
                OAUTH_ACCESS_TOKEN_SECRET: "test-cloud-entry-secret",
                OAUTH_ISSUER: `http://127.0.0.1:${port}`,
            };
            if (deploymentMode) env.OUTLINER_DEPLOYMENT_MODE = deploymentMode;
            else delete env.OUTLINER_DEPLOYMENT_MODE;
            const child = spawn(process.execPath, ["--loader", "ts-node/esm", "src/index.ts"], {
                cwd: path.resolve(import.meta.dirname, ".."),
                env,
                stdio: "ignore",
            });
            children.push(child);
            const base = `http://127.0.0.1:${port}`;
            const deadline = Date.now() + 15000;
            while (Date.now() < deadline) {
                try {
                    if ((await fetch(`${base}/api/deployment`)).ok) break;
                } catch { /* listener is starting */ }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            expect(await (await fetch(`${base}/api/deployment`)).json()).to.deep.equal({ deploymentMode: "cloud" });
            let directory: Response | undefined;
            const authDeadline = Date.now() + 10000;
            while (Date.now() < authDeadline) {
                directory = await fetch(`${base}/api/projects`, { headers: { authorization: `Bearer ${token}` } });
                if (directory.ok) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            expect(directory?.status).to.equal(200);
            expect(await directory!.json()).to.deep.equal({
                projects: [{ projectId: "cloud-entry-project", title: "Cloud Entry Project" }],
            });
            expect(
                (await fetch(`${base}/api/projects`, {
                    headers: { cookie: "outliner_local_session=forged-local-cookie" },
                })).status,
            ).to.equal(401);
            const provider = new HocuspocusProvider({
                url: `ws://127.0.0.1:${port}/projects/cloud-entry-project`,
                name: "projects/cloud-entry-project",
                document: new Y.Doc(),
                token,
                WebSocketPolyfill: WebSocket,
            });
            providers.push(provider);
            await waitFor(provider, "synced");

            class LocalCookieWebSocket extends WebSocket {
                constructor(address: string | URL, protocols?: string | string[]) {
                    super(address, protocols, { headers: { cookie: "outliner_local_session=forged-local-cookie" } });
                }
            }
            const cookieOnly = new HocuspocusProvider({
                url: `ws://127.0.0.1:${port}/projects/cloud-entry-project`,
                name: "projects/cloud-entry-project",
                document: new Y.Doc(),
                token: "not-a-firebase-token",
                WebSocketPolyfill: LocalCookieWebSocket,
            });
            providers.push(cookieOnly);
            await waitFor(cookieOnly, "authenticationFailed");
        });
    }
});
