import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : Test environment initialization and preparation
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

const html = `<!DOCTYPE html>
<html>
    <head><title>Playwright Test</title></head>
    <body>
        <main>
            <h1>Hello Playwright</h1>
            <button type="button" onclick="this.textContent = 'Clicked'">Run action</button>
        </main>
    </body>
</html>`;

test.beforeEach(async ({ page }) => {
    await page.goto(`data:text/html,${encodeURIComponent(html)}`);
});

test("launches Chromium, renders a document, and handles user input", async ({ page }) => {
    await expect(page).toHaveTitle("Playwright Test");
    await expect(page.getByRole("heading", { name: "Hello Playwright" })).toBeVisible();

    const action = page.getByRole("button", { name: "Run action" });
    await action.click();
    await expect(page.getByRole("button", { name: "Clicked" })).toBeVisible();
});

test("captures a lossless WebP screenshot with the expected file signature", async ({ page }) => {
    const screenshot = await page.locator("main").screenshot({ type: "webp" });

    // A WebP file is a RIFF container whose format marker starts at byte 8.
    expect(screenshot.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(screenshot.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(screenshot.byteLength).toBeGreaterThan(100);
});

test("cancels a pending browser operation through AbortSignal", async ({ page }) => {
    const controller = new AbortController();
    const pendingElement = page.locator("#element-that-never-appears");
    const pendingAssertion = expect(pendingElement).toBeVisible({ timeout: 0, signal: controller.signal });

    controller.abort("Playwright cancellation sanity check");

    await expect(pendingAssertion).rejects.toThrow(/aborted/i);
});
