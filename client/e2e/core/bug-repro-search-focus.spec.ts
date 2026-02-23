import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Bug Reproduction: Search Box Focus", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Seed some data
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Item 1"]);
    });

    test("Typing in search box should not input into editor item", async ({ page }) => {
        // 1. Focus on the second item (the content item, not the title)
        await TestHelpers.waitForOutlinerItems(page, 2);
        const contentItem = page.locator(".outliner-item").nth(1);
        // Click to focus the item
        await contentItem.locator(".item-text").click();

        // Ensure editor has focus (GlobalTextArea usually takes focus)
        // We might need to wait a tiny bit for the focus logic to settle
        await page.waitForTimeout(200);
        await expect(page.locator("textarea.global-textarea")).toBeFocused();

        // 2. Click/Focus the search box
        const searchInput = page.locator('[data-testid="search-pages-input"]');
        await searchInput.click();

        // Ensure search box has focus
        await expect(searchInput).toBeFocused();

        // 3. Type text
        const searchText = "test search";
        await page.keyboard.type(searchText);

        // 4. Verify text appears in search box
        await expect(searchInput).toHaveValue(searchText);

        // 5. Verify text does NOT appear in the editor item
        // The item should still contain "Item 1"
        const itemText = contentItem.locator(".item-text");
        await expect(itemText).toHaveText("Item 1");
    });
});
