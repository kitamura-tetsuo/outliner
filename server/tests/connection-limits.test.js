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

describe("connection limits", () => {
    afterEach(() => sinon.restore());

    it("closes connection when message exceeds size", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({
            PORT: "12349",
            LOG_LEVEL: "silent",
            MAX_MESSAGE_SIZE_BYTES: "5",
        });
        const { server } = startServer(cfg);
        await waitListening(server);
        await new Promise(resolve => {
            const ws = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=token`);
            ws.on("open", () => ws.send("1234567890"));
            ws.on("close", code => {
                expect(code).to.equal(4005);
                resolve();
            });
        });
        server.close();
    });
});
