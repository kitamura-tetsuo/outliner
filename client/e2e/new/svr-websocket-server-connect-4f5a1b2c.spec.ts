import { expect, test } from "@playwright/test";
import { type ChildProcess, spawn } from "child_process";
import path from "path";
import { TestHelpers } from "../utils/testHelpers";

let proc: ChildProcess | undefined;

test.beforeEach(async ({ page }) => {
    await TestHelpers.prepareTestEnvironment(page);
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
    const connected = await page.evaluate(() =>
        new Promise<boolean>((resolve, reject) => {
            const ws = new WebSocket("ws://localhost:12350");
            ws.onopen = () => {
                ws.close();
                resolve(true);
            };
            ws.onerror = () => reject(false);
        })
    );
    expect(connected).toBe(true);
});
