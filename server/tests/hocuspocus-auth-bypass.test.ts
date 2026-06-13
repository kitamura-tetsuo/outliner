import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect } from "chai";
import sinon from "sinon";
import WebSocket from "ws";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

// Ensure HocuspocusProvider's unhandled rejection on WebSocket failure doesn't crash Mocha
process.on("unhandledRejection", (reason: any) => {
    if (reason && reason.message === "WebSocket was closed before the connection was established") {
        // Ignore this specific known bug in @hocuspocus/provider 4.1.0 test wrapper
        return;
    }
});

class SafeWebSocket extends WebSocket {
    constructor(...args: any[]) {
        super(...(args as [any]));
        this.on('error', (e: any) => {
            if (e.message === "WebSocket was closed before the connection was established") return;
        });
    }
    close(code?: number, reason?: string | Buffer) {
        try { super.close(code, reason); } catch(e) {}
    }
}
(global as any).WebSocket = SafeWebSocket;

describe("Hocuspocus Auth Bypass Reproduction", () => {
    let httpServer: any;
    let port: number;
    let checkAccessStub: sinon.SinonStub;
    let verifyTokenStub: sinon.SinonStub;
    let shutdown: () => Promise<void>;

    beforeEach(async () => {
        checkAccessStub = sinon.stub();
        verifyTokenStub = sinon.stub();

        process.env.DISABLE_Y_LEVELDB = "true";

        const config = loadConfig({ PORT: "0", LOG_LEVEL: "silent" });
        const res = await startServer(config, undefined, {
            checkContainerAccess: checkAccessStub,
            verifyIdTokenCached: verifyTokenStub,
        });
        httpServer = res.server;
        shutdown = res.shutdown;

        await new Promise<void>(resolve => {
            if (httpServer.listening) resolve();
            else httpServer.on("listening", resolve);
        });
        port = (httpServer.address() as any).port;
    });

    afterEach(async () => {
        if (shutdown) await shutdown();
        sinon.restore();
        delete process.env.DISABLE_Y_LEVELDB;
    });

    const createBypassTest = (path: string) => async () => {
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}${path}`,
            name: path.replace(/^\/+/, ""), // clean name
            document: new Y.Doc(),
            WebSocketPolyfill: SafeWebSocket,
            maxRetries: 0
        });

        await new Promise<void>((resolve, reject) => {
            provider.on("synced", () => {
                reject(new Error("Should NOT have synced! Vulnerability exists if this passes."));
            });

            provider.on("close", () => {
                resolve();
            });

            // Just in case it hangs waiting
            setTimeout(() => {
                resolve();
            }, 500);
        });

        provider.destroy();
    };

    it("should BLOCK connection to non-project path without auth (FIXED)", createBypassTest("/bypassed-document"));
    it("should BLOCK connection to project-like path if obscured (e.g. //projects) (FIXED)", createBypassTest("//projects/123"));
    it("should BLOCK connection to normal /projects path without auth", createBypassTest("/projects/123"));
});
