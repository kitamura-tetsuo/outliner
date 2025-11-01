import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-9a2f4dce
 *  Title   : External link navigation
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

(test.describe)("External link navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("clicking bracketed URL opens the target", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // Use insertText instead of type to ensure proper formatting
        await page.keyboard.insertText("[https://example.com]");

        // Press Enter to create a new item and potentially process the previous item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");

        // Move focus away from the first item to ensure it's no longer in editing mode
        // First click on the second item to shift focus
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId).not.toBeNull();

        // Click the second item to shift focus from first item
        await page.locator(`.outliner-item[data-item-id="${secondItemId}"]`).locator(".item-content").click();

        // Wait for the update to propagate and for the first item to be rendered in non-editing mode
        await page.waitForTimeout(2000);

        // Check if the link is now visible in the first item
        const link = page.locator(".outliner-item").first().locator("a");
        await expect(link).toBeVisible({ timeout: 15000 });

        const [popup] = await Promise.all([
            page.waitForEvent("popup"),
            link.click(),
        ]);
        await popup.waitForLoadState();
        expect(popup.url()).toContain("https://example.com");
        await popup.close();
    });
});
