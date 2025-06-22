/** @feature SRE-001
 *  Title   : Advanced Search & Replace
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("SRE-001: Advanced Search & Replace", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "apple banana",
            "banana apple",
            "cherry banana",
        ]);
    });

    test("search panel should be visible", async ({ page }) => {
        const openButton = page.locator(".search-btn");
        if (await openButton.count()) {
            await openButton.click();
        }
        await expect(page.locator(".search-panel")).toBeVisible();
    });

    test("highlight results and replace text", async ({ page }) => {
        const openButton = page.locator(".search-btn");
        await openButton.click();

        const searchInput = page.locator(".search-panel input[name='search']");
        await searchInput.fill("banana");
        await searchInput.press("Enter");

        // verify highlights appear for matching items
        const highlights = page.locator('.search-highlight');
        await expect(highlights.first()).toBeVisible();

        const replaceInput = page.locator(".search-panel input[name='replace']");
        await replaceInput.fill("orange");
        await page.locator('.replace-all-btn').click();

        // wait for tree update
        await page.waitForTimeout(500);

        const treeData = await TreeValidator.getTreeData(page);
        const json = JSON.stringify(treeData);
        expect(json).toContain('orange');
        expect(json).not.toContain('banana');
    });
});
