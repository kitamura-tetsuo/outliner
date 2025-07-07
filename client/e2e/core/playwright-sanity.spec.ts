/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

test("Playwright is operational", async ({ page }) => {
    const html =
        "<!DOCTYPE html><html><head><title>Playwright Test</title></head><body><h1>Hello Playwright</h1></body></html>";
    await page.goto(`data:text/html,${html}`);
    await expect(page).toHaveTitle("Playwright Test");
    await expect(page.locator("h1")).toHaveText("Hello Playwright");
});
