/** @feature SRE-001
 *  Title   : Advanced Search & Replace (regex)
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRE-001: Advanced Search & Replace regex", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "regex line 1",
            "regex line 2",
            "other line",
        ]);
    });

    test("regex search highlights matching lines", async ({ page }) => {
        await page.locator(".search-btn").click();
        await expect(page.locator(".search-panel")).toBeVisible();

        // enable regex mode
        await page.locator('label:has-text("正規表現") input').check();

        await page.fill("#search-input", "regex line \\d");
        await page.click(".search-btn-action");
        await page.waitForTimeout(500);
        const highlightCount = await page.locator(".search-highlight").count();
        expect(highlightCount).toBe(2);
    });
});
