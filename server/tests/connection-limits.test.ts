import { expect } from "chai";
import { once } from "events";
import admin from "firebase-admin";
import fs from "fs-extra";
import { Server } from "http";
import { afterEach, describe, it } from "mocha";
import os from "os";
import path from "path";
import sinon from "sinon";
import WebSocket from "ws";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

const OriginalWebSocket = WebSocket;
// @ts-ignore
const SilentWebSocket = class extends OriginalWebSocket {
    constructor(url: any, protocols: any) {
        super(url, protocols);
        this.on('error', () => {});
    }
};

function waitListening(server: Server): Promise<void> {
    return new Promise(resolve => server.on("listening", resolve));
}

describe("connection limits", () => {
    let server: Server;
    let cleanupDir: string | null = null;
    let cleanupSockets: WebSocket[] = [];

    afterEach(async () => {
        for (const ws of cleanupSockets) {
            ws.close();
        }
        cleanupSockets = [];
        if (server) {
            await new Promise<void>(resolve => server.close(() => resolve()));
            server = undefined as any;
        }
        if (cleanupDir) {
            await fs.remove(cleanupDir);
            cleanupDir = null;
        }
        sinon.restore();
    });

    it("closes connection when message exceeds size", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves(
            { uid: "user", exp: Math.floor(Date.now() / 1000) + 60 } as any,
        );
        cleanupDir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const cfg = loadConfig({
            PORT: "12349",
            LOG_LEVEL: "silent",
            MAX_MESSAGE_SIZE_BYTES: "5",
            DATABASE_PATH: cleanupDir,
        });
        const res = await startServer(cfg);
        server = res.server;
        await waitListening(server);

        await new Promise<void>((resolve, reject) => {
            const ws = new SilentWebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=token`);
            cleanupSockets.push(ws as any);
            ws.on("open", () => ws.send("1234567890"));
            ws.on("close", (code: any) => {
                try {
                    expect(code).to.equal(4005);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    });

    it("enforces per-room socket limit", async () => {
        sinon
            .stub(admin.auth(), "verifyIdToken")
            .callsFake((token: string) =>
                Promise.resolve({ uid: token, exp: Math.floor(Date.now() / 1000) + 60 } as any)
            );
        cleanupDir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const cfg = loadConfig({
            PORT: "12350",
            LOG_LEVEL: "silent",
            DATABASE_PATH: cleanupDir,
            MAX_SOCKETS_PER_ROOM: "1",
        });
        const res = await startServer(cfg);
        server = res.server;
        await waitListening(server);

        const ws1 = new SilentWebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=a`);
        cleanupSockets.push(ws1 as any);
        await once(ws1, "open");

        await new Promise<void>((resolve, reject) => {
            const ws2 = new SilentWebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=b`);
            cleanupSockets.push(ws2 as any);
            ws2.on("close", (code: any) => {
                try {
                    expect(code).to.equal(4006);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    });

    it("enforces per-ip socket limit", async () => {
        sinon
            .stub(admin.auth(), "verifyIdToken")
            .callsFake((token: string) =>
                Promise.resolve({ uid: token, exp: Math.floor(Date.now() / 1000) + 60 } as any)
            );
        cleanupDir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const cfg = loadConfig({
            PORT: "12351",
            LOG_LEVEL: "silent",
            DATABASE_PATH: cleanupDir,
            MAX_SOCKETS_PER_IP: "1",
            MAX_SOCKETS_PER_ROOM: "2",
        });
        const res = await startServer(cfg);
        server = res.server;
        await waitListening(server);

        const ws1 = new SilentWebSocket(`ws://localhost:${cfg.PORT}/projects/testproj?auth=a`);
        cleanupSockets.push(ws1 as any);
        await once(ws1, "open");

        await new Promise<void>((resolve, reject) => {
            const ws2 = new SilentWebSocket(`ws://localhost:${cfg.PORT}/projects/other?auth=b`);
            cleanupSockets.push(ws2 as any);
            ws2.on("close", (code: any) => {
                try {
                    expect(code).to.equal(4008);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    });
});
