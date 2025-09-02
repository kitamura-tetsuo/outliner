const { once } = require("events");
const WebSocket = require("ws");
require("ts-node/register");
const { expect } = require("chai");
const sinon = require("sinon");
const admin = require("firebase-admin");
const { loadConfig } = require("../src/config");
const { startServer } = require("../src/server");

describe("server probes", () => {
    afterEach(() => sinon.restore());
    it("exposes readiness and metrics endpoints", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({ PORT: "12350", LOG_LEVEL: "silent" });
        const { server, markReady } = startServer(cfg, undefined, false);
        await once(server, "listening");

        let res = await fetch(`http://localhost:${cfg.PORT}/readyz`);
        expect(res.status).to.equal(503);

        markReady();
        res = await fetch(`http://localhost:${cfg.PORT}/readyz`);
        expect(res.status).to.equal(200);

        res = await fetch(`http://localhost:${cfg.PORT}/metrics`);
        let json = await res.json();
        expect(json.sockets).to.equal(0);
        expect(json.rooms).to.equal(0);

        const ws = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=token`);
        await once(ws, "open");
        res = await fetch(`http://localhost:${cfg.PORT}/metrics`);
        json = await res.json();
        expect(json.sockets).to.equal(1);
        expect(json.rooms).to.equal(1);

        ws.close();
        server.close();
    });
});
