const { expect } = require("chai");
const WebSocket = require("ws");
require("ts-node/register");
const admin = require("firebase-admin");
const sinon = require("sinon");
const { loadConfig } = require("../src/config");
const { startServer } = require("../src/server");

function waitListening(server) {
    return new Promise(resolve => server.on("listening", resolve));
}

describe("server room validation", () => {
    afterEach(() => sinon.restore());

    it("rejects invalid room", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({ PORT: "12360", LOG_LEVEL: "silent" });
        const { server } = startServer(cfg);
        await waitListening(server);
        await new Promise(resolve => {
            const ws = new WebSocket(`ws://localhost:${cfg.PORT}/invalid?auth=token`);
            ws.on("close", code => {
                expect(code).to.equal(4002);
                resolve();
            });
        });
        server.close();
    });
});
