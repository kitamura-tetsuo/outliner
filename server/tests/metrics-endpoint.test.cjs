const { expect } = require("chai");
const { once } = require("events");
const WebSocket = require("ws");
require("ts-node/register");
const sinon = require("sinon");
const admin = require("firebase-admin");
const http = require("http");
const { loadConfig } = require("../src/config");
const { startServer } = require("../src/server");

function waitListening(server) {
    return new Promise(resolve => server.on("listening", resolve));
}

function get(path, port) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}${path}`, res => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => resolve({ status: res.statusCode, text: data }));
        }).on("error", reject);
    });
}

describe("metrics endpoint", () => {
    afterEach(() => sinon.restore());

    it("reports message count", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({ PORT: "12348", LOG_LEVEL: "silent" });
        const { server } = await startServer(cfg);
        await waitListening(server);
        const ws = new WebSocket(`ws://localhost:${cfg.PORT}/projects/test?auth=token`);
        await once(ws, "open");
        await new Promise(r => setTimeout(r, 50));
        ws.send(Buffer.from([0]));
        await new Promise(r => setTimeout(r, 100));
        ws.close();
        const { status, text } = await get("/metrics", cfg.PORT);
        expect(status).to.equal(200);
        const json = JSON.parse(text);
        expect(json.totalMessages).to.be.greaterThan(0);
        server.close();
    });
});
