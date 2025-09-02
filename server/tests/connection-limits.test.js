const { expect } = require("chai");
const { once } = require("events");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
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

    it("enforces per-room socket limit", async () => {
        sinon
            .stub(admin.auth(), "verifyIdToken")
            .callsFake(token => Promise.resolve({ uid: token, exp: Math.floor(Date.now() / 1000) + 60 }));
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const cfg = loadConfig({ PORT: "12350", LOG_LEVEL: "silent", LEVELDB_PATH: dir, MAX_SOCKETS_PER_ROOM: "1" });
        const { server } = startServer(cfg);
        await waitListening(server);
        const ws1 = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=a`);
        await once(ws1, "open");
        await new Promise(resolve => {
            const ws2 = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=b`);
            ws2.on("close", code => {
                expect(code).to.equal(4006);
                resolve();
            });
        });
        ws1.close();
        server.close();
        await fs.remove(dir);
    });

    it("enforces per-ip socket limit", async () => {
        sinon
            .stub(admin.auth(), "verifyIdToken")
            .callsFake(token => Promise.resolve({ uid: token, exp: Math.floor(Date.now() / 1000) + 60 }));
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const cfg = loadConfig({
            PORT: "12351",
            LOG_LEVEL: "silent",
            LEVELDB_PATH: dir,
            MAX_SOCKETS_PER_IP: "1",
            MAX_SOCKETS_PER_ROOM: "2",
        });
        const { server } = startServer(cfg);
        await waitListening(server);
        const ws1 = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=a`);
        await once(ws1, "open");
        await new Promise(resolve => {
            const ws2 = new WebSocket(`ws://localhost:${cfg.PORT}/projects/other?auth=b`);
            ws2.on("close", code => {
                expect(code).to.equal(4006);
                resolve();
            });
        });
        ws1.close();
        server.close();
        await fs.remove(dir);
    });
});
