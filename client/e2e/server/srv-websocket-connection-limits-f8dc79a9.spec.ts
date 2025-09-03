/** @feature SRV-f8dc79a9
 *  Title   : WebSocket connection limits
 *  Source  : docs/client-features/srv-websocket-connection-limits-f8dc79a9.yaml
 */
import { expect, test } from "@playwright/test";
// @ts-ignore
import WebSocket from "../../../server/node_modules/ws";
import { TestHelpers } from "../utils/testHelpers";
// @ts-ignore
import "../../../server/node_modules/ts-node/register";
// eslint-disable-next-line @typescript-eslint/no-var-requires
// @ts-ignore
const admin = require("../../../server/node_modules/firebase-admin");
// eslint-disable-next-line @typescript-eslint/no-var-requires
// @ts-ignore
const sinon = require("../../../server/node_modules/sinon");
// eslint-disable-next-line @typescript-eslint/no-var-requires
// @ts-ignore
const { loadConfig } = require("../../../server/src/config");
// eslint-disable-next-line @typescript-eslint/no-var-requires
// @ts-ignore
const { startServer } = require("../../../server/src/server");

test.describe("WebSocket connection limits", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("rejects second connection when per-room limit reached", async () => {
        const port = 16000 + Math.floor(Math.random() * 1000);
        sinon.stub(admin.auth(), "verifyIdToken").resolves({ uid: "user", exp: Math.floor(Date.now() / 1000) + 60 });
        const cfg = loadConfig({ PORT: String(port), LOG_LEVEL: "silent", MAX_SOCKETS_PER_ROOM: "1" });
        const { server } = startServer(cfg);
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
import "../utils/registerAfterEachSnapshot";
