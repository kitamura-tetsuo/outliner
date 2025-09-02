const { once } = require("events");
const WebSocket = require("ws");
require("ts-node/register");
const admin = require("firebase-admin");
const sinon = require("sinon");
const { loadConfig } = require("../src/config");
const { startServer } = require("../src/server");

function waitListening(server) {
    return new Promise(resolve => server.on("listening", resolve));
}

describe("server", () => {
    afterEach(() => sinon.restore());
    it("accepts websocket connections", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({ PORT: "12346", LOG_LEVEL: "silent" });
        const { server } = startServer(cfg);
        await waitListening(server);
        const ws = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=token`);
        await once(ws, "open");
        ws.close();
        server.close();
    });
});
