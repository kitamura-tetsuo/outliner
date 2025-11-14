import "./utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import WebSocket from "ws";
import { registerCoverageHooks } from "./utils/registerCoverageHooks";
import { TestHelpers } from "./utils/testHelpers";
registerCoverageHooks();

test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
});

test("oversized websocket message closes connection", async () => {
    await expect(async () => {
        await new Promise<void>(resolve => {
            const ws = new WebSocket("ws://localhost:3000/projects/testproj?auth=token");
            ws.on("open", () => ws.send("1234567890"));
            ws.on("close", () => resolve());
        });
    }).resolves.not.toThrow();
});
