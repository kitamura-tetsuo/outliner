/** @feature SRV-9a4b1c2d
 *  Title   : WebSocket server basic integration
 *  Source  : docs/client-features/srv-websocket-basic-integration-9a4b1c2d.yaml
 */
import { expect, test } from "@playwright/test";
import WebSocket from "ws";
import { TestHelpers } from "../utils/testHelpers";

test.describe("WebSocket server authentication", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("invalid token is rejected", async () => {
        await new Promise<void>(resolve => {
            const port = process.env.TEST_API_PORT ?? "7091";
            const ws = new WebSocket(`ws://localhost:${port}/projects/testproj?auth=bad`);
            ws.on("close", code => {
                expect(code).toBe(4001);
                resolve();
            });
        });
    });
});
