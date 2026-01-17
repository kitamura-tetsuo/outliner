import { expect } from "chai";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import sinon from "sinon";
import WebSocket from "ws";
import { startServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

// @ts-ignore
global.WebSocket = WebSocket;

const mockDecodedIdToken = {
    uid: "test-uid",
} as any;

describe("Hocuspocus Server", () => {
    let server: Server;
    let httpServer: any;
    let provider: HocuspocusProvider;
    let port: number;
    let checkAccessStub: sinon.SinonStub;
    let verifyTokenStub: sinon.SinonStub;
    let shutdown: () => Promise<void>;

    beforeEach(async () => {
        checkAccessStub = sinon.stub();
        verifyTokenStub = sinon.stub();

        process.env.DISABLE_Y_LEVELDB = "true";

        const config = loadConfig({ PORT: "0", LOG_LEVEL: "info" });
        const res = await startServer(config, undefined, {
            checkContainerAccess: checkAccessStub,
            verifyIdTokenCached: verifyTokenStub,
        });
        server = res.hocuspocus;
        httpServer = res.server;
        shutdown = res.shutdown;

        await new Promise<void>(resolve => {
             if (httpServer.listening) resolve();
             else httpServer.on('listening', resolve);
        });
        port = (httpServer.address() as any).port;
    });

    afterEach(async () => {
        provider?.destroy();
        if (shutdown) await shutdown();
        sinon.restore();
        delete process.env.DISABLE_Y_LEVELDB;
    });

    const createClient = (token: string = "dummy") => {
        return new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}`,
            name: "projects/123",
            document: new Y.Doc(),
            token,
        });
    };

    const expectDisconnect = (provider: HocuspocusProvider, expectedCode: number) => {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timed out waiting for disconnect code ${expectedCode}`));
            }, 5000);

            provider.on("disconnect", ({ code }: { code: number; }) => {
                clearTimeout(timeout);
                try {
                    expect(code).to.equal(expectedCode);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    };

    it("should fail authentication with no token", async () => {
        provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}`,
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

        const connection1 = await (server as any).hocuspocus.openDirectConnection("projects/123");
        connection1.transact(doc => {
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
