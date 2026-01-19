import { expect } from "chai";
import { once } from "events";
import admin from "firebase-admin";
import http from "http";
import sinon from "sinon";
import WebSocket from "ws";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

function waitListening(server: any) {
    return new Promise(resolve => server.on("listening", resolve));
}

function get(path: string, port: string): Promise<{ status: number | undefined; text: string; }> {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}${path}`, res => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => resolve({ status: res.statusCode, text: data }));
        }).on("error", reject);
    });
}

import { clearTokenCache } from "../src/websocket-auth.js";

describe("metrics endpoint", () => {
    let server: any;

    afterEach(async () => {
        if (server) {
            await new Promise<void>(resolve => server.close(() => resolve()));
            server = undefined;
        }
        sinon.restore();
        clearTokenCache();
    });

    it("reports message count", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").resolves(
            { uid: "user", exp: Math.floor(Date.now() / 1000) + 60 } as any,
        );
        const cfg = loadConfig({ PORT: "12348", LOG_LEVEL: "silent" });
        const res = await startServer(cfg);
        server = res.server;
        await waitListening(server);
        const ws = new WebSocket(`ws://localhost:${cfg.PORT}/projects/test?auth=token`);
        await once(ws, "open");
        await new Promise(r => setTimeout(r, 50));
        ws.send(Buffer.from([0]));
        await new Promise(r => setTimeout(r, 100));
        ws.close();
        const { status, text } = await get("/metrics", cfg.PORT.toString());
        expect(status).to.equal(200);
        const json = JSON.parse(text);
        expect(json.totalMessages).to.be.greaterThan(0);
    });
});
