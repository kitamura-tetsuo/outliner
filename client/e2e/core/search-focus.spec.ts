import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Search Box Focus", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Focus should remain on search box when clicked", async ({ page }) => {
        // Wait for items to appear
        const firstItem = page.locator(".outliner-item[data-item-id]").first();
        await firstItem.waitFor();

        // Click on the first item to focus the editor
        await firstItem.click();

        // Ensure editor is focused (GlobalTextArea is focused)
        await page.waitForTimeout(500);

        // Click on the search box
        const searchInput = page.locator("#search-pages-input");
        await searchInput.click();

        // Wait a bit for potential focus stealing
        await page.waitForTimeout(1000);

        // Check if search box is focused
        await expect(searchInput).toBeFocused();

        // Try typing
        await searchInput.fill("Search Term");
        await expect(searchInput).toHaveValue("Search Term");
    });
});
