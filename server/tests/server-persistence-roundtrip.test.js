const { expect } = require("chai");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { once } = require("events");
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

describe("server integration: persistence and sync", () => {
    afterEach(() => {
        sinon.restore();
        clearTokenCache();
    });

    it("persists document across restart", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const port = 13000 + Math.floor(Math.random() * 1000);
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({ PORT: String(port), LOG_LEVEL: "silent", LEVELDB_PATH: dir });
        let { server } = startServer(cfg);
        await waitListening(server);
        const doc1 = new Y.Doc();
        const provider1 = new WebsocketProvider(`ws://localhost:${port}`, "projects/testproj", doc1, {
            params: { auth: "token" },
            WebSocketPolyfill: WebSocket,
        });
        await waitConnected(provider1);
        doc1.getText("t").insert(0, "hello");
        await new Promise(r => setTimeout(r, 100));
        provider1.destroy();
        doc1.destroy();
        server.close();

        ({ server } = startServer(cfg));
        await waitListening(server);
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

    it("syncs updates between two clients", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const port = 14000 + Math.floor(Math.random() * 1000);
        sinon
            .stub(admin.auth(), "verifyIdToken")
            .callsFake(token => Promise.resolve({ uid: token, exp: Math.floor(Date.now() / 1000) + 60 }));
        const cfg = loadConfig({ PORT: String(port), LOG_LEVEL: "silent", LEVELDB_PATH: dir });
        const { server } = startServer(cfg);
        await waitListening(server);

        const doc1 = new Y.Doc();
        const provider1 = new WebsocketProvider(`ws://localhost:${port}`, "projects/testproj", doc1, {
            params: { auth: "token1" },
            WebSocketPolyfill: WebSocket,
        });
        const doc2 = new Y.Doc();
        const provider2 = new WebsocketProvider(`ws://localhost:${port}`, "projects/testproj", doc2, {
            params: { auth: "token2" },
            WebSocketPolyfill: WebSocket,
        });
        await Promise.all([waitConnected(provider1), waitConnected(provider2)]);

        doc1.getText("t").insert(0, "hi");
        await new Promise(resolve => doc2.once("update", () => resolve()));
        expect(doc2.getText("t").toString()).to.equal("hi");

        provider1.destroy();
        provider2.destroy();
        doc1.destroy();
        doc2.destroy();
        server.close();
        await fs.remove(dir);
    });
});
