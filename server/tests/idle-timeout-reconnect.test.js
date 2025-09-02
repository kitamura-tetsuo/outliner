const { expect } = require("chai");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");
const Y = require("yjs");
const { WebsocketProvider } = require("y-websocket");
const sinon = require("sinon");
require("ts-node/register");
const admin = require("firebase-admin");
const { loadConfig } = require("../src/config");
const { startServer } = require("../src/server");
const { clearTokenCache } = require("../src/websocket-auth");

function waitListening(server) {
    return new Promise(resolve => server.on("listening", resolve));
}

function waitConnected(provider) {
    return new Promise(resolve => {
        provider.on("status", event => {
            if (event.status === "connected") {
                resolve();
            }
        });
    });
}

describe("idle timeout", () => {
    afterEach(() => {
        sinon.restore();
        clearTokenCache();
    });

    it("disconnects idle clients and preserves state on reconnect", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const port = 15000 + Math.floor(Math.random() * 1000);
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({
            PORT: String(port),
            LOG_LEVEL: "silent",
            LEVELDB_PATH: dir,
            IDLE_TIMEOUT_MS: "100",
        });
        const { server } = startServer(cfg);
        await waitListening(server);

        const doc1 = new Y.Doc();
        const provider1 = new WebsocketProvider(`ws://localhost:${port}`, "projects/testproj", doc1, {
            params: { auth: "token" },
            WebSocketPolyfill: WebSocket,
        });
        await waitConnected(provider1);
        doc1.getText("t").insert(0, "hello");
        await new Promise(r => setTimeout(r, 60));
        const closed = new Promise(resolve => {
            provider1.ws.on("close", code => {
                expect(code).to.equal(4004);
                resolve();
            });
        });
        await closed;
        provider1.destroy();
        doc1.destroy();

        const doc2 = new Y.Doc();
        const provider2 = new WebsocketProvider(`ws://localhost:${port}`, "projects/testproj", doc2, {
            params: { auth: "token" },
            WebSocketPolyfill: WebSocket,
        });
        await waitConnected(provider2);
        expect(doc2.getText("t").toString()).to.equal("hello");
        provider2.destroy();
        doc2.destroy();
        server.close();
        await fs.remove(dir);
    });
});
