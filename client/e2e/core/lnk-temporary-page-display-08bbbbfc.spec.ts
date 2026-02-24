import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0004
 *  Title   : Temporary Page Feature
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0004: Temporary Page Display", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Temporary page is displayed when clicking a link to a non-existent page", async ({ page }) => {
        const sourceUrl = page.url();
        const nonExistentPage = "non-existent-page-" + Date.now().toString().slice(-6);
        await page.goto(`${sourceUrl}${nonExistentPage}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(300);
        }

        const currentUrl = page.url();
        expect(currentUrl).toContain(nonExistentPage);

        const pageTitle = await page.locator("h1").textContent();
        expect(pageTitle).not.toBe("");
    });
});
