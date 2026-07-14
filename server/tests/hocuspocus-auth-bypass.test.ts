import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect } from "chai";
import sinon from "sinon";
import WebSocket from "ws";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

// @ts-expect-error
global.WebSocket = WebSocket;

describe("Hocuspocus Auth Bypass Reproduction", () => {
    let httpServer: any;
    let port: number;
    let checkAccessStub: sinon.SinonStub;
    let verifyTokenStub: sinon.SinonStub;
    let shutdown: () => Promise<void>;
    let resolved = false;
    const handleError = (err: any) => {
        if (!resolved && err.message.includes("Cannot set property 'binaryType' of null")) {
            return;
        }
        if (!resolved && err.message.includes("WebSocket was closed before the connection was established")) {
            return;
        }
        throw err;
    };

    beforeEach(async () => {
        resolved = false;
        process.on('uncaughtException', handleError);
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
        process.removeListener('uncaughtException', handleError);
        if (shutdown) await shutdown();
        sinon.restore();
        delete process.env.DISABLE_Y_LEVELDB;
    });

    // Helper to extract code from disconnect event
    const getCode = (data: any) => {
        // HocuspocusProvider disconnect event structure might vary.
        // It's usually { event: CloseEvent }
        if (data && data.event && data.event.code) return data.event.code;
        if (data && data.code) return data.code;
        return undefined;
    };

    it("should BLOCK connection to non-project path without auth (FIXED)", async () => {
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/bypassed-document`,
            name: "bypassed-document",
            document: new Y.Doc(),
        });

        await new Promise<void>((resolve, reject) => {
            provider.on("synced", () => {
                reject(new Error("Should NOT have synced! Vulnerability exists if this passes."));
            });

            provider.on("disconnect", (data) => {
                // Expected disconnect.
                // The server closes with 4001 (Unauthorized) or similar.
                // Or 4003 Forbidden or 1002 Protocol Error if path invalid.
                // In our fix: "Authentication failed: Invalid room format" -> 4001 Unauthorized (because token missing first)
                // Wait, logic:
                // 1. extractAuthToken -> throws "No token provided"
                // 2. catch(e) -> ws.close(4001, "Authentication failed: No token provided")
                const code = getCode(data);
                if (!resolved) {
                    resolved = true;
                    process.removeListener('uncaughtException', handleError);
                    resolve();
                }
            });
        });

        provider.destroy();
    });

    it("should BLOCK connection to project-like path if obscured (e.g. //projects) (FIXED)", async () => {
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}//projects/123`,
            name: "projects/123",
            document: new Y.Doc(),
        });

        await new Promise<void>((resolve, reject) => {
            provider.on("synced", () => {
                reject(new Error("Should NOT have synced! Vulnerability exists if this passes."));
            });

            provider.on("status", (data: any) => {
                if (data.status === "disconnected") {
                    if (!resolved) {
                        resolved = true;
                        process.removeListener('uncaughtException', handleError);
                        resolve();
                    }
                }
            });

            // Handle the unhandled exception thrown in tests by the mocked WebSocket
            // when it closes during CONNECTING phase (readyState 0).
            const ws = (provider as any).configuration.websocketProvider?.webSocket;
            if (ws) {
                ws.addEventListener("error", (e: any) => {
                    if (!resolved) {
                        resolved = true;
                        process.removeListener('uncaughtException', handleError);
                        resolve();
                    }
                });
            }
        });

        provider.destroy();
    });

    it("should BLOCK connection to normal /projects path without auth", async () => {
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/123`,
            name: "projects/123",
            document: new Y.Doc(),
        });

        await new Promise<void>((resolve, reject) => {
            provider.on("status", (data: any) => {
                if (data.status === "disconnected") {
                    if (!resolved) {
                        resolved = true;
                        process.removeListener('uncaughtException', handleError);
                        resolve();
                    }
                }
            });

            provider.on("synced", () => {
                reject(new Error("Should not have synced!"));
            });

            const ws = (provider as any).configuration.websocketProvider?.webSocket;
            if (ws) {
                ws.addEventListener("error", (e: any) => {
                    if (!resolved) {
                        resolved = true;
                        process.removeListener('uncaughtException', handleError);
                        resolve();
                    }
                });
            }
        });

        provider.destroy();
    });
});
