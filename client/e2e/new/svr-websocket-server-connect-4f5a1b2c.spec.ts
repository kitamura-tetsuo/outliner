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

test("connects to websocket server", async ({ page }) => {
    const serverPath = path.resolve(__dirname, "../../../server");
    proc = spawn("pnpm", ["dev"], {
        cwd: serverPath,
        env: { ...process.env, PORT: "12350", LOG_LEVEL: "silent" },
        stdio: "ignore",
    });
    await new Promise((res) => setTimeout(res, 1000));
    const token = await page.evaluate(() => window.__USER_MANAGER__.getIdToken());
    const connected = await page.evaluate(token =>
        new Promise<boolean>((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:12350/projects/testproj?auth=${token}`);
            ws.onopen = () => {
                ws.close();
                resolve(true);
            };
            ws.onerror = () => reject(false);
        }), token);
    expect(connected).toBe(true);
});
