const { once } = require("events");
const WebSocket = require("ws");
require("ts-node/register");
const admin = require("firebase-admin");
const sinon = require("sinon");
const { loadConfig } = require("../src/config");
const { startServer } = require("../src/server");
const persistenceModule = require("../src/persistence");

function waitListening(server) {
    return new Promise(resolve => server.on("listening", resolve));
}

describe("server update listener cleanup", () => {
    afterEach(() => sinon.restore());

    it("removes update listeners when connections close", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const warnStub = sinon.stub(persistenceModule, "warnIfRoomTooLarge").resolves();
        const cfg = loadConfig({ PORT: "12348", LOG_LEVEL: "silent", LEVELDB_ROOM_SIZE_WARN_MB: "0" });
        const { server, persistence } = startServer(cfg);
        await waitListening(server);
        const url = `ws://localhost:${cfg.PORT}/projects/testproj?auth=token`;

        const ws1 = new WebSocket(url);
        await once(ws1, "open");
        const ws2 = new WebSocket(url);
        await once(ws2, "open");

        const doc = await persistence.getYDoc("testproj");
        doc.getArray("a").insert(0, ["1"]);
        sinon.assert.calledOnce(warnStub);

        ws1.close();
        doc.getArray("a").insert(0, ["2"]);
        sinon.assert.calledTwice(warnStub);

        ws2.close();
        doc.getArray("a").insert(0, ["3"]);
        sinon.assert.calledTwice(warnStub);

        server.close();
    });
});
