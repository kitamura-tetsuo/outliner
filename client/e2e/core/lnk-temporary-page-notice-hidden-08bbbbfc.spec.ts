import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0004
 *  Title   : Temporary Page Functionality
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0004: Temporary page notice hidden", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Temporary page notice UI is hidden", async ({ page }) => {
        const consoleMessages: string[] = [];
        page.on("console", msg => {
            consoleMessages.push(`${msg.type()}: ${msg.text()}`);
        });

        const sourceUrl = page.url();
        const nonExistentPage = "temp-page-ui-" + Date.now().toString().slice(-6);
        await page.goto(`${sourceUrl}${nonExistentPage}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton = page.locator("button:has-text('Developer Login')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(300);
        }

        const outlinerBase = page.locator("[data-testid='outliner-base']");
        await expect(outlinerBase).toBeVisible();

        const noticeElement = page.locator(".temporary-page-notice");
        await expect(noticeElement).not.toBeVisible();
    });
});
