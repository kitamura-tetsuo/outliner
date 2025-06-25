/** @feature SRE-001
 *  Title   : Advanced Search & Replace
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRE-001: Advanced Search & Replace", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("search, replace and highlight", async ({ page }) => {
        await page.locator(".search-btn").click();
        await expect(page.locator(".search-panel")).toBeVisible();

        await page.fill("#search-input", "ページです");
        await page.click(".search-btn-action");
        await page.waitForTimeout(500);
        const highlightCount = await page.locator(".search-highlight").count();
        expect(highlightCount).toBe(2);

        await page.fill("#replace-input", "PAGE");
        await page.click(".replace-all-btn");
        await page.waitForTimeout(500);
        await page.click(".search-btn-action");
        const newHighlight = await page.locator(".search-highlight").count();
        expect(newHighlight).toBe(0);
        const replaced = page.locator(".outliner-item .item-text").filter({ hasText: "PAGE" });
        await expect(replaced.first()).toBeVisible();
    });
});
