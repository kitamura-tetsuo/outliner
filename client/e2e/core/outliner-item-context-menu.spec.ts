import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Outliner Item Context Menu Navigation", () => {
    test("Context menu can be navigated using Arrow keys without losing focus", async ({ page }, testInfo) => {
        test.setTimeout(120000);

        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Menu item 1",
            "Menu item 2",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 2);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);

        // Explicitly focus the item wrapper, matching what would happen
        // through keyboard navigation, then trigger the context menu keyboard shortcut.
        await firstItem.focus();
        await page.keyboard.press("Shift+F10");

        // Assert that the context menu is visible and a menuitem is focused
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible();

        // Initially focus should be on the first menuitem
        const firstMenuItem = contextMenu.locator('button').first();
        await expect(firstMenuItem).toBeFocused();

        // Press ArrowDown
        await page.keyboard.press('ArrowDown');

        // Verify focus moved to the second menuitem
        const secondMenuItem = contextMenu.locator('button[role="menuitem"]').nth(1);
        await expect(secondMenuItem).toBeFocused();

        // Verify we are still in the context menu
        await expect(contextMenu).toBeVisible();

        // Press ArrowUp
        await page.keyboard.press('ArrowUp');

        // Verify focus moved back to the first menuitem
        await expect(firstMenuItem).toBeFocused();
    });
});
