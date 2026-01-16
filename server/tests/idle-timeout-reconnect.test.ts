import { expect } from "chai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import sinon from "sinon";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import "ts-node/register";
import admin from "firebase-admin";
import { Server } from "http";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";
import { clearTokenCache } from "../src/websocket-auth.js";

function waitListening(server: Server) {
    return new Promise(resolve => server.on("listening", resolve));
}

function waitConnected(provider: WebsocketProvider) {
    return new Promise<void>(resolve => {
        provider.on("status", (event: { status: string; }) => {
            if (event.status === "connected") {
                resolve();
            }
        });
    });
}

describe("idle timeout", () => {
    afterEach(() => {
        sinon.restore();
        clearTokenCache();
    });

    it("disconnects idle clients and preserves state on reconnect", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const port = 15000 + Math.floor(Math.random() * 1000);
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({
            PORT: String(port),
            LOG_LEVEL: "silent",
            LEVELDB_PATH: dir,
            IDLE_TIMEOUT_MS: "100",
        });
        const { server } = startServer(cfg);
        await waitListening(server);

        const doc1 = new Y.Doc();
        const provider1 = new WebsocketProvider(`ws://localhost:${port}`, "projects/testproj", doc1, {
            params: { auth: "token" },
            WebSocketPolyfill: WebSocket,
        });
        await waitConnected(provider1);
        const closed = new Promise<void>(resolve => {
            provider1.ws.on("close", (code: any) => {
                expect(code).to.equal(4004);
                provider1.destroy();
                resolve();
            });
        });
        const synced1 = new Promise(resolve => {
            const handler = state => {
                if (state) {
                    provider1.off("synced", handler);
                    resolve();
                }
            };
            provider1.on("synced", handler);
        });
        doc1.getText("t").insert(0, "hello");
        await synced1;
        await closed;
        doc1.destroy();

        const doc2 = new Y.Doc();
        const provider2 = new WebsocketProvider(`ws://localhost:${port}`, "projects/testproj", doc2, {
            params: { auth: "token" },
            WebSocketPolyfill: WebSocket,
        });
        await waitConnected(provider2);
        if (!provider2.synced) {
            await new Promise(resolve => {
                const handler = state => {
                    if (state) {
                        provider2.off("synced", handler);
                        resolve();
                    }
                };
                provider2.on("synced", handler);
            });
        }
        expect(doc2.getText("t").toString()).to.equal("hello");
        provider2.destroy();
        doc2.destroy();
        server.close();
        await fs.remove(dir);
    });
});
