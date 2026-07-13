import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect } from "chai";
import sinon from "sinon";
import WebSocket from "ws";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

// @ts-expect-error
global.WebSocket = class extends WebSocket {
  close() {
    try {
      if (this.readyState === WebSocket.CONNECTING) {
        this.emit("error", new Error("Closed before connected"));
      }
      super.close();
    } catch (e) {}
  }
};

class SafeWebSocket extends WebSocket {
    constructor(url: any, protocols: any, options: any) {
        super(url, protocols, options);
        this.on('error', () => {}); // Swallow unhandled errors to prevent test crashes
    }
}

describe("Hocuspocus Auth Bypass Reproduction", () => {
    let httpServer: any;
    let port: number;
    let checkAccessStub: sinon.SinonStub;
    let verifyTokenStub: sinon.SinonStub;
    let shutdown: () => Promise<void>;
    let providers: HocuspocusProvider[] = [];

    beforeEach(async () => {
        providers = [];
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
        for (const provider of providers) {
            try {
                provider.destroy();
            } catch(e) {}
        }
        if (shutdown) await shutdown();
        sinon.restore();
        delete process.env.DISABLE_Y_LEVELDB;
    });

    const getCode = (data: any) => {
        if (data && data.event && data.event.code) return data.event.code;
        if (data && data.code) return data.code;
        return undefined;
    };

    it("should BLOCK connection to non-project path without auth (FIXED)", async () => {
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/bypassed-document`,
            name: "bypassed-document",
            WebSocketPolyfill: SafeWebSocket as any,
            document: new Y.Doc(),
        });
        providers.push(provider);

        await new Promise<void>((resolve, reject) => {
            let resolved = false;

            provider.on("synced", () => {
                if (!resolved) { resolved = true; reject(new Error("Should NOT have synced! Vulnerability exists if this passes.")); }
            });

            provider.on("disconnect", (data) => {
                if (!resolved) { resolved = true; resolve(); }
            });

            provider.on("destroy", () => { if (!resolved) { resolved = true; resolve(); } });
        });
    });

    it("should BLOCK connection to project-like path if obscured (e.g. //projects) (FIXED)", async () => {
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}//projects/123`,
            name: "projects/123",
            WebSocketPolyfill: SafeWebSocket as any,
            connect: false,
            document: new Y.Doc(),
        });
        providers.push(provider);

        await new Promise<void>((resolve, reject) => {
            let resolved = false;

            const handleFail = () => {
                if (!resolved) { resolved = true; resolve(); }
            };

            provider.on("synced", () => {
                if (!resolved) { resolved = true; reject(new Error("Should NOT have synced!")); }
            });

            provider.on("status", (data: any) => {
                if (data.status === "disconnected") {
                    handleFail();
                }
            });

            provider.on("authenticationFailed", handleFail);

            // Safety timeout
            setTimeout(handleFail, 1000);
            provider.connect();
        });
    });

    it("should BLOCK connection to normal /projects path without auth", async () => {
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/123`,
            name: "projects/123",
            WebSocketPolyfill: SafeWebSocket as any,
            connect: false,
            document: new Y.Doc(),
        });
        providers.push(provider);

        await new Promise<void>((resolve, reject) => {
            let resolved = false;

            const handleFail = () => {
                if (!resolved) { resolved = true; resolve(); }
            };

            provider.on("status", (data: any) => {
                if (data.status === "disconnected") {
                    handleFail();
                }
            });

            provider.on("synced", () => {
                if (!resolved) { resolved = true; reject(new Error("Should not have synced!")); }
            });

            provider.on("authenticationFailed", handleFail);

            // Safety timeout
            setTimeout(handleFail, 1000);
            provider.connect();
        });
    });
});
