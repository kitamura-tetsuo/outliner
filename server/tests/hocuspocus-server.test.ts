import { HocuspocusProvider } from "@hocuspocus/provider";
import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import sinon from "sinon";
import WebSocket from "ws";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

const OriginalWebSocket = WebSocket;
// @ts-ignore
global.WebSocket = class extends OriginalWebSocket {
    constructor(url: any, protocols: any) {
        super(url, protocols);
        this.on('error', () => {});
    }
};

const mockDecodedIdToken = {
    uid: "test-uid",
} as any;

describe("Hocuspocus Server", () => {
    let server: Hocuspocus;
    let httpServer: any;
    let port: number;
    let checkAccessStub: sinon.SinonStub;
    let verifyTokenStub: sinon.SinonStub;
    let shutdown: () => Promise<void>;
    let dbDir: string;
    let createdProviders: HocuspocusProvider[] = [];

    beforeEach(async () => {
        createdProviders = [];
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "hocuspocus-test-"));
        checkAccessStub = sinon.stub();
        verifyTokenStub = sinon.stub();

        const config = loadConfig({ PORT: "0", LOG_LEVEL: "silent", DATABASE_PATH: dbDir });
        const res = await startServer(config, undefined, {
            checkContainerAccess: checkAccessStub,
            verifyIdTokenCached: verifyTokenStub,
        });
        server = res.hocuspocus;
        httpServer = res.server;
        shutdown = res.shutdown;

        await new Promise<void>(resolve => {
            if (httpServer.listening) resolve();
            else httpServer.on("listening", resolve);
        });
        port = (httpServer.address() as any).port;
        // Wait for SQLite initialization
        await new Promise(r => setTimeout(r, 500));
    });

    afterEach(async () => {
        for (const prov of createdProviders) {
            try {
                prov.disconnect();
                prov.destroy();
            } catch(e) {}
        }
        if (shutdown) await shutdown();
        sinon.restore();
        await fs.remove(dbDir);
    });

    const createClient = (token: string = "dummy") => {
        const prov = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/123?token=${token}`,
            name: "projects/123",
            document: new Y.Doc(),
            token, // Still pass it here in case it's used elsewhere
            maxRetries: 0,
            quiet: true
        });
        createdProviders.push(prov);
        return prov;
    };

    const expectAuthFailure = (prov: HocuspocusProvider) => {
        return new Promise<void>((resolve, reject) => {
            let done = false;

            const finish = () => {
                if (done) return;
                done = true;
                clearTimeout(timeout);
                resolve();
            };

            const timeout = setTimeout(() => {
                if (done) return;
                done = true;
                reject(new Error("Timeout waiting for auth failure"));
            }, 1000);

            prov.on("authenticationFailed", finish);
            prov.on("disconnect", finish);
            prov.on("close", finish);

            prov.on("status", (event: any) => {
                if (event.status === "disconnected") {
                    finish();
                }
            });
        });
    };

    it("should load a document", async () => {
        verifyTokenStub.resolves(mockDecodedIdToken);
        checkAccessStub.resolves(true);

        const connection1 = await (server as any).openDirectConnection("projects/123");

        const provider = createClient("valid-token");

        await new Promise<void>((resolve, reject) => {
            let done = false;
            const timeout = setTimeout(() => {
                if (done) return;
                done = true;
                reject(new Error("Timeout waiting for sync"));
            }, 3000);

            provider.on("status", (event: any) => {
                if (event.status === "connected") {
                    if (done) return;
                    done = true;
                    clearTimeout(timeout);
                    resolve();
                }
            });

            provider.on("synced", () => {
                if (done) return;
                done = true;
                clearTimeout(timeout);
                resolve();
            });
        });

        // Test editing over direct connection
        connection1.transact((doc: any) => {
            doc.getText("test").insert(0, "hello");
        });

        // Ensure provider receives the update
        await new Promise<void>((resolve, reject) => {
            let done = false;
            const timeout = setTimeout(() => {
                if (done) return;
                done = true;
                resolve(); // resolve anyway to check the value
            }, 1000);

            const check = () => {
                 if (provider.document.getText("test").toString() === "hello") {
                     if (done) return;
                     done = true;
                     clearTimeout(timeout);
                     resolve();
                 }
            };

            provider.document.on('update', check);
            check();
        });

        expect(provider.document.getText("test").toString()).to.equal("hello");

        try { connection1.disconnect(); } catch(e) {}
    });

    it("should fail authentication with no token", async () => {
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/123`,
            name: "projects/123",
            document: new Y.Doc(),
            maxRetries: 0,
            quiet: true
        });
        createdProviders.push(provider);
        await expectAuthFailure(provider);
    });

    it("should fail with invalid token", async () => {
        verifyTokenStub.rejects(new Error("Invalid token"));
        const provider = createClient("bad-token");
        await expectAuthFailure(provider);
    });

    it("should fail with no access", async () => {
        verifyTokenStub.resolves(mockDecodedIdToken);
        checkAccessStub.resolves(false);
        const provider = createClient("valid-token-no-access");
        await expectAuthFailure(provider);
    });
});
