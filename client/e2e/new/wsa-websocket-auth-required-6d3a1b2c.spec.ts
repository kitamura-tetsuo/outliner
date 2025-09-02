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

test("websocket requires auth token", async ({ page }) => {
    const serverPath = path.resolve(__dirname, "../../../server");
    proc = spawn("pnpm", ["dev"], {
        cwd: serverPath,
        env: { ...process.env, PORT: "12352", LOG_LEVEL: "silent" },
        stdio: "ignore",
    });
    await new Promise((res) => setTimeout(res, 1000));

    const closeCode = await page.evaluate(() =>
        new Promise<number>((resolve) => {
            const ws = new WebSocket("ws://localhost:12352");
            ws.onclose = e => resolve(e.code);
        })
    );
    expect(closeCode).toBe(4001);
});
