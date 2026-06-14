import { HocuspocusProvider } from "@hocuspocus/provider";
import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import sinon from "sinon";
import WebSocket from "ws";
const OriginalWebSocket = WebSocket as any;
// @ts-ignore
global.WebSocket = class extends OriginalWebSocket {
    constructor(...args: any[]) {
        super(...args);
    }
    close(code?: number, data?: string) {
        if (this.readyState === 0) {
            this.onclose = () => {};
            this.onerror = () => {};
            return;
        }
        try { super.close(code, data); } catch (e) {}
    }
};
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

// @ts-ignore
global.WebSocket = WebSocket;

const mockDecodedIdToken = {
    uid: "test-uid",
} as any;

describe("Hocuspocus Server", () => {
    let server: Hocuspocus;
    let httpServer: any;
    let provider: HocuspocusProvider;
    let port: number;
    let checkAccessStub: sinon.SinonStub;
    let verifyTokenStub: sinon.SinonStub;
    let shutdown: () => Promise<void>;
    let dbDir: string;

    beforeEach(async () => {
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "hocuspocus-test-"));
        checkAccessStub = sinon.stub();
        verifyTokenStub = sinon.stub();

        const config = loadConfig({ PORT: "0", LOG_LEVEL: "info", DATABASE_PATH: dbDir });
        const res = await startServer(config, undefined, {
            checkContainerAccess: checkAccessStub,
            verifyIdTokenCached: verifyTokenStub,
        });
        server = res.hocuspocus;
        httpServer = res.server;
        shutdown = res.shutdown;

        await new Promise<void>((resolve) => {
            let resolved = false;
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            }, 1000);

            provider.on("synced", () => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeoutId);
                expect(provider.document.getText("test").toString()).to.equal("hello");
                resolve();
            });
        });
    });
});
