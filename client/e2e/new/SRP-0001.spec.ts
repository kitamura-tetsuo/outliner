/** @feature SRP-0001
 *  Title   : Project-Wide Search & Replace
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRP-0001: Project-Wide Search & Replace", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First page line",
        ]);
        await TestHelpers.createTestPageViaAPI(page, "second", ["Second page line"]);
    });

    test("search across pages and replace", async ({ page }) => {
        await page.locator(".search-btn").click();
        await expect(page.locator(".search-panel")).toBeVisible();

        await page.fill("#search-input", "page line");
        await page.click(".search-btn-action");
        await page.waitForTimeout(500);
        const results = await page.locator(".search-results .result-item").count();
        expect(results).toBeGreaterThanOrEqual(2);

        await page.fill("#replace-input", "UPDATED");
        await page.click(".replace-all-btn");
        await page.waitForTimeout(500);
        await page.click(".search-btn-action");
        const newHighlight = await page.locator(".search-results .result-item").count();
        expect(newHighlight).toBe(0);

        await page.locator(".search-results .result-item").first().click();
        await expect(page).toHaveURL(/second/);
        const pageText = await page.locator(".outliner-item .item-text").first().textContent();
        expect(pageText).toContain("UPDATED");
    });
});
