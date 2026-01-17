import { expect } from "chai";
import { once } from "events";
import admin from "firebase-admin";
import fs from "fs-extra";
import os from "os";
import path from "path";
import sinon from "sinon";
import WebSocket from "ws";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

function waitListening(server: any) {
    return new Promise(resolve => server.on("listening", resolve));
}

describe("connection limits", () => {
    afterEach(() => sinon.restore());

    it("closes connection when message exceeds size", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves(
            { uid: "user", exp: Math.floor(Date.now() / 1000) + 60 } as any,
        );
        const cfg = loadConfig({
            PORT: "12349",
            LOG_LEVEL: "silent",
            MAX_MESSAGE_SIZE_BYTES: "5",
        });
        const { server } = await startServer(cfg);
        await waitListening(server);
        await new Promise<void>(resolve => {
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
            .callsFake((token: string) =>
                Promise.resolve({ uid: token, exp: Math.floor(Date.now() / 1000) + 60 } as any)
            );
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const cfg = loadConfig({ PORT: "12350", LOG_LEVEL: "silent", LEVELDB_PATH: dir, MAX_SOCKETS_PER_ROOM: "1" });
        const { server } = await startServer(cfg);
        await waitListening(server);
        const ws1 = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=a`);
        await once(ws1, "open");
        await new Promise<void>(resolve => {
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
            .callsFake((token: string) =>
                Promise.resolve({ uid: token, exp: Math.floor(Date.now() / 1000) + 60 } as any)
            );
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const cfg = loadConfig({
            PORT: "12351",
            LOG_LEVEL: "silent",
            LEVELDB_PATH: dir,
            MAX_SOCKETS_PER_IP: "1",
            MAX_SOCKETS_PER_ROOM: "2",
        });
        const { server } = await startServer(cfg);
        await waitListening(server);
        const ws1 = new WebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=a`);
        await once(ws1, "open");
        await new Promise<void>(resolve => {
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
