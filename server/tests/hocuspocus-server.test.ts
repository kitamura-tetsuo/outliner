import { jest } from "@jest/globals";
jest.setTimeout(30000);
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

// @ts-ignore
global.WebSocket = WebSocket;

const mockDecodedIdToken = {
    uid: "test-uid",
} as any;

describe("Hocuspocus Server", () => {
    let server: Hocuspocus;
    let httpServer: any;
    let provider: HocuspocusProvider;
    let port: number;
    let checkAccessStub: sinon.SinonStub;
    let verifyTokenStub: sinon.SinonStub;
    let shutdown: () => Promise<void>;
    let dbDir: string;

    beforeEach(async () => {
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "hocuspocus-test-"));
        checkAccessStub = sinon.stub();
        verifyTokenStub = sinon.stub();

        const config = loadConfig({ PORT: "0", LOG_LEVEL: "info", DATABASE_PATH: dbDir });
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
        try { provider?.destroy(); } catch(e){}
        if (shutdown) await shutdown();
        sinon.restore();
        await fs.remove(dbDir);
    });

    const createClient = (token: string = "dummy") => {
        return new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/123?token=${token}`,
            name: "projects/123",
            document: new Y.Doc(),
            token, // Still pass it here in case it's used elsewhere
            WebSocketPolyfill: WebSocket as any,
            maxRetries: 0,
        });
    };

    const expectAuthFailure = (provider: HocuspocusProvider) => {
        return new Promise<void>((resolve, reject) => {
            let handled = false;
            const timeout = setTimeout(() => {
                if(!handled) {
                    handled = true;
                    try{ provider.destroy(); }catch(e){}
                    reject(new Error("Timed out waiting for auth failure"));
                }
            }, 3000);

            const cleanup = (event?: any) => {
                if(!handled) {
                    handled = true;
                    clearTimeout(timeout);
                    try{ provider.destroy(); }catch(e){}
                    resolve();
                }
            };

            provider.on("authenticationFailed", (e: any) => cleanup(e));
            provider.configuration.websocketProvider.on("close", (e: any) => cleanup(e));
            provider.on("close", (e: any) => cleanup(e));
            provider.on("disconnect", (e: any) => cleanup(e));
            provider.on("destroy", (e: any) => cleanup(e));
        });
    };

    it("should fail authentication with no token", async () => {
        // No token: rejected synchronously in upgrade handler before Hocuspocus
        provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/123`,
            name: "projects/123",
            document: new Y.Doc(),
            WebSocketPolyfill: WebSocket as any,
            maxRetries: 0,
        });
        await expectAuthFailure(provider);
    });

    it("should fail with invalid token", async () => {
        verifyTokenStub.rejects(new Error("Invalid token"));
        provider = createClient("bad-token");
        await expectAuthFailure(provider);
    });

    it("should fail with no access", async () => {
        verifyTokenStub.resolves(mockDecodedIdToken);
        checkAccessStub.resolves(false);
        provider = createClient("valid-token-no-access");
        await expectAuthFailure(provider);
    });

    it("should load a document", async () => {
        provider = undefined as any; // safety wipe

        verifyTokenStub.resolves(mockDecodedIdToken);
        checkAccessStub.resolves(true);

        const connection1 = await (server as any).openDirectConnection("projects/123");
        connection1.transact((doc: any) => {
            doc.getText("test").insert(0, "hello");
        });
        provider = createClient("valid-token");

        await new Promise<void>(resolve => {
            provider.on("synced", () => {
                expect(provider.document.getText("test").toString()).to.equal("hello");
                resolve();
            });
        });
    });
});
