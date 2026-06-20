import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect } from "chai";
import sinon from "sinon";
import WebSocket from "ws";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

// @ts-expect-error
global.WebSocket = WebSocket;

// Regression coverage for the public demo room (`projects/demo`).
// The demo page is served to signed-out users, so the websocket server must
// accept the connection without a verifiable Firebase ID token. This flow
// broke in production twice (#2982, #2986) because it had no test coverage:
// the client sends a dummy token ("1") to make HocuspocusProvider emit its
// Auth message, and the server must short-circuit auth before verifying it.
describe("Hocuspocus demo room anonymous access", () => {
    let httpServer: any;
    let provider: HocuspocusProvider;
    let port: number;
    let checkAccessStub: sinon.SinonStub;
    let verifyTokenStub: sinon.SinonStub;
    let shutdown: () => Promise<void>;

    beforeEach(async () => {
        checkAccessStub = sinon.stub().resolves(false);
        // Rejects like production would for the dummy "1" token; demo rooms must never reach it
        verifyTokenStub = sinon.stub().rejects(new Error("invalid token (test stub)"));

        process.env.DISABLE_PERSISTENCE = "true";

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
        provider?.destroy();
        if (shutdown) await shutdown();
        sinon.restore();
        delete process.env.DISABLE_PERSISTENCE;
    });

    const waitForAuthenticated = (p: HocuspocusProvider) =>
        new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timed out waiting for authenticated event")), 8000);
            p.on("authenticated", () => {
                clearTimeout(timeout);
                resolve();
            });
            p.on("authenticationFailed", (data: unknown) => {
                clearTimeout(timeout);
                reject(new Error(`authenticationFailed: ${JSON.stringify(data)}`));
            });
        });

    it("authenticates the demo room exactly like the production client (url ?token=1, provider token '1')", async () => {
        // Mirrors createProjectConnection() in client/src/lib/yjs/connection.ts
        provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/demo?token=1`,
            name: "projects/demo",
            document: new Y.Doc(),
            token: "1",
        });

        await waitForAuthenticated(provider);

        // Demo access must not consult Firebase token verification or Firestore ACLs
        expect(verifyTokenStub.called).to.equal(false);
        expect(checkAccessStub.called).to.equal(false);
    });

    it("authenticates the demo room without a token in the upgrade URL", async () => {
        // Reconnects may omit the URL token and send it only in the Auth payload
        provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/demo`,
            name: "projects/demo",
            document: new Y.Doc(),
            token: "1",
        });

        await waitForAuthenticated(provider);
        expect(verifyTokenStub.called).to.equal(false);
    });

    it("still rejects non-demo rooms that present the dummy demo token", async () => {
        provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/123?token=1`,
            name: "projects/123",
            document: new Y.Doc(),
            token: "1",
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timed out waiting for auth rejection")), 8000);
            const done = () => {
                clearTimeout(timeout);
                resolve();
            };
            provider.on("authenticationFailed", done);
            provider.on("disconnect", done);
            provider.on("authenticated", () => {
                clearTimeout(timeout);
                reject(new Error("Dummy token must not authenticate a non-demo room"));
            });
        });
    });
});
