import { expect } from "chai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import sinon from "sinon";
import WebSocket from "ws";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

const OriginalWebSocket = WebSocket;
// @ts-ignore
global.WebSocket = class extends OriginalWebSocket {
    constructor(url: any, protocols: any) {
        super(url, protocols);
        this.on('error', () => {});
    }
};

describe("Hocuspocus Auth Bypass Reproduction", () => {
    let httpServer: any;
    let port: number;
    let checkAccessStub: sinon.SinonStub;
    let verifyTokenStub: sinon.SinonStub;
    let shutdown: () => Promise<void>;
    let createdSockets: WebSocket[] = [];

    beforeEach(async () => {
        createdSockets = [];
        checkAccessStub = sinon.stub();
        verifyTokenStub = sinon.stub();

        process.env.DISABLE_Y_LEVELDB = "true";

        const config = loadConfig({ PORT: "0", LOG_LEVEL: "silent" });
        const res = await startServer(config, undefined, {
            checkContainerAccess: checkAccessStub,
            verifyIdTokenCached: verifyTokenStub,
        });
        httpServer = res.server;
        shutdown = res.shutdown;

        await new Promise<void>(resolve => {
            if (httpServer.listening) resolve();
            else httpServer.on("listening", resolve);
        });
        port = (httpServer.address() as any).port;
    });

    afterEach(async () => {
        for (const ws of createdSockets) {
            try { ws.close(); } catch(e) {}
        }
        if (shutdown) await shutdown();
        sinon.restore();
        delete process.env.DISABLE_Y_LEVELDB;
    });

    it("should BLOCK connection to non-project path without auth (FIXED)", async () => {
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/bypassed-document`);
            createdSockets.push(ws);

            ws.on("open", () => reject(new Error("Should not have opened connection!")));
            ws.on("close", (code) => {
                expect(code).to.not.equal(1000); // 1000 is normal closure
                resolve();
            });
        });
    });

    it("should BLOCK connection to project-like path if obscured (e.g. //projects) (FIXED)", async () => {
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}//projects/123`);
            createdSockets.push(ws);

            ws.on("open", () => reject(new Error("Should not have opened connection!")));
            ws.on("close", (code) => {
                expect(code).to.not.equal(1000);
                resolve();
            });
        });
    });

    it("should BLOCK connection to normal /projects path without auth", async () => {
        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/projects/123`);
            createdSockets.push(ws);

            ws.on("open", () => reject(new Error("Should not have opened connection!")));
            ws.on("close", (code) => {
                expect(code).to.not.equal(1000);
                resolve();
            });
        });
    });
});
