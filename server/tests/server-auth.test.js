const { expect } = require("chai");
const { once } = require("events");
const WebSocket = require("ws");
const sinon = require("sinon");
require("ts-node/register");
const admin = require("firebase-admin");
const { loadConfig } = require("../src/config");
const { startServer } = require("../src/server");

function waitListening(server) {
    return new Promise(resolve => server.on("listening", resolve));
}

describe("server websocket auth", () => {
    afterEach(() => sinon.restore());

    it("rejects connection without token", async () => {
        const cfg = loadConfig({ PORT: "12347", LOG_LEVEL: "silent" });
        const { server } = startServer(cfg);
        await waitListening(server);
        await new Promise(resolve => {
            const ws = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj`);
            ws.on("close", code => {
                expect(code).to.equal(4001);
                resolve();
            });
        });
        server.close();
    });

    it("accepts connection with valid token", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({ PORT: "12348", LOG_LEVEL: "silent" });
        const { server } = startServer(cfg);
        await waitListening(server);
        const ws = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=token`);
        await once(ws, "open");
        ws.close();
        server.close();
    });

    it("rejects connection with invalid token", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").rejects(new Error("bad"));
        const cfg = loadConfig({ PORT: "12349", LOG_LEVEL: "silent" });
        const { server } = startServer(cfg);
        await waitListening(server);
        await new Promise(resolve => {
            const ws = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=bad`);
            ws.on("close", code => {
                expect(code).to.equal(4001);
                resolve();
            });
        });
        server.close();
    });
});
