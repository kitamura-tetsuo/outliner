import { expect, test } from "@playwright/test";
import { type ChildProcess, spawn } from "child_process";
import path from "path";
import { TestHelpers } from "../utils/testHelpers";

let proc: ChildProcess | undefined;

test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
});

test.afterEach(() => {
    proc?.kill();
});

test("rejects invalid room name", async ({ page }) => {
    const serverPath = path.resolve(__dirname, "../../../server");
    proc = spawn("pnpm", ["dev"], {
        cwd: serverPath,
        env: { ...process.env, PORT: "12353", LOG_LEVEL: "silent" },
        stdio: "ignore",
    });
    await new Promise(res => setTimeout(res, 1000));
    const token = await page.evaluate(() => window.__USER_MANAGER__.getIdToken());
    const closeCode = await page.evaluate(token =>
        new Promise<number>(resolve => {
            const ws = new WebSocket(`ws://localhost:12353/invalid?auth=${token}`);
            ws.onclose = e => resolve(e.code);
        }), token);
    expect(closeCode).toBe(4002);
});
