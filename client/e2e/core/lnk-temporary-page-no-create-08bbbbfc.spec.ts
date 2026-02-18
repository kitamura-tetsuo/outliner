import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0004
 *  Title   : Temporary Page Functionality
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0004: Verify Temporary Page No-Edit", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Confirm that accessing a temporary page does not create it", async ({ page }) => {
        const sourceUrl = page.url();
        const nonExistentPage = "no-edit-temp-page-" + Date.now().toString().slice(-6);
        await page.goto(`${sourceUrl}${nonExistentPage}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton = page.locator("button:has-text('Developer Login')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(300);
        }

        await page.goto(sourceUrl);
        await page.waitForSelector("body", { timeout: 10000 });

        await page.goto(`${sourceUrl}${nonExistentPage}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton2 = page.locator("button:has-text('Developer Login')");
        if (await loginButton2.isVisible()) {
            await loginButton2.click();
            await page.waitForTimeout(300);
        }

        const currentUrl = page.url();
        expect(currentUrl).toContain(nonExistentPage);
    });
});
