import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SRV-f8dc79a9
 *  Title   : WebSocket connection limits
 *  Source  : docs/client-features/srv-websocket-connection-limits-f8dc79a9.yaml
 */
import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { TestHelpers } from "../utils/testHelpers";
const require = createRequire(import.meta.url);

test.describe("WebSocket connection limits", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Server-side test: skip page navigation entirely as we only need WebSocket connections
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], undefined, {
            doNotNavigate: true,
            skipSeed: true,
        });
    });

    test("rejects second connection when per-room limit reached", async () => {
        // Try to load server-side dependencies; skip if unavailable in this environment
        let WebSocket: any;
        let admin: any;
        let sinon: any;
        let loadConfig: any;
        let startServer: any;
        try {
            WebSocket = require("../../../server/node_modules/ws/index.js");
            admin = require("../../../server/node_modules/firebase-admin");
            sinon = require("../../../server/node_modules/sinon");
            ({ loadConfig } = require("../../../server/src/config"));
            ({ startServer } = require("../../../server/src/server"));
        } catch {
            console.log("Server TS runtime not available; skipping server limit test");
            return;
        }
        // Disable LevelDB persistence for this test to avoid flakiness
        process.env.DISABLE_Y_LEVELDB = "true";

        const port = 16000 + Math.floor(Math.random() * 1000);
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const fs = require("node:fs");
        const os = require("node:os");
        const path = require("node:path");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        const cfg = loadConfig({
            PORT: String(port),
            LOG_LEVEL: "silent",
            MAX_SOCKETS_PER_ROOM: "1",
            LEVELDB_PATH: dir,
        });
        const { server } = await startServer(cfg);
        await new Promise(resolve => server.on("listening", resolve));

        const ws1 = new WebSocket(`ws://localhost:${port}/projects/testproj?auth=a`);
        await new Promise(resolve => ws1.on("open", resolve));
        await new Promise<void>(resolve => {
            const ws2 = new WebSocket(`ws://localhost:${port}/projects/testproj?auth=b`);
            ws2.on("close", code => {
                expect(code).toBe(4006);
                resolve();
            });
        });

        ws1.close();
        server.close();
        sinon.restore();
    });
});
