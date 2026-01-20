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
        provider?.destroy();
        if (shutdown) await shutdown();
        sinon.restore();
        await fs.remove(dbDir);
    });

    const createClient = (token: string = "dummy") => {
        // Append token to URL because server.on('upgrade') checks it there
        // (HocuspocusProvider 'token' option is sent in the WebSocket message, which is too late for upgrade-time auth)
        return new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/123?token=${token}`,
            name: "projects/123",
            document: new Y.Doc(),
            token, // Still pass it here in case it's used elsewhere
        });
    };

    const expectDisconnect = (provider: HocuspocusProvider, expectedCode: number) => {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timed out waiting for disconnect code ${expectedCode}`));
            }, 5000);

            provider.on("disconnect", (data: any) => {
                clearTimeout(timeout);
                const code = data.code ?? data.event?.code;
                try {
                    expect(code).to.equal(expectedCode);
                    provider.disconnect(); // Stop retrying
                    resolve();
                } catch (e) {
                    console.error("Disconnect code mismatch. Data:", JSON.stringify(data));
                    reject(e);
                }
            });
        });
    };

    it("should fail authentication with no token", async () => {
        provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/123`,
            name: "projects/123",
            document: new Y.Doc(),
        });
        await expectDisconnect(provider, 4001);
    });

    it("should fail with invalid token", async () => {
        verifyTokenStub.rejects(new Error("Invalid token"));
        provider = createClient("bad-token");
        await expectDisconnect(provider, 4001);
    });

    it("should fail with no access", async () => {
        verifyTokenStub.resolves(mockDecodedIdToken);
        checkAccessStub.resolves(false);
        provider = createClient("valid-token-no-access");
        await expectDisconnect(provider, 4003);
    });

    it("should load a document", async () => {
        verifyTokenStub.resolves(mockDecodedIdToken);
        checkAccessStub.resolves(true);

        const connection1 = await (server as any).openDirectConnection("projects/123");
        connection1.transact((doc: any) => {
            doc.getText("test").insert(0, "hello");
        });

        // HocuspocusProvider connects
        provider = createClient("valid-token");

        await new Promise<void>(resolve => {
            provider.on("synced", () => {
                expect(provider.document.getText("test").toString()).to.equal("hello");
                resolve();
            });
        });
    });
});
