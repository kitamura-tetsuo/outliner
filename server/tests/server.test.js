const { once } = require("events");
const WebSocket = require("ws");
require("ts-node/register");
const { loadConfig } = require("../src/config");
const { startServer } = require("../src/server");

function waitListening(server) {
    return new Promise(resolve => server.on("listening", resolve));
}

describe("server", () => {
    it("accepts websocket connections", async () => {
        const cfg = loadConfig({ PORT: "12346", LOG_LEVEL: "silent" });
        const { server } = startServer(cfg);
        await waitListening(server);
        const ws = new WebSocket(`ws://localhost:${cfg.PORT}`);
        await once(ws, "open");
        ws.close();
        server.close();
    });
});
