import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-0002
 *  Title   : Add item via button
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-0002: Add item via button", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Prepare test environment using TestHelpers
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Wait for the add item button to be displayed
        await page.waitForSelector('button:has-text("Add Item")', { timeout: 10000 });
    });

    test("clicking add item button appends new item", async ({ page }) => {
        // Get the number of items before adding
        const itemCountBefore = await page.locator(".outliner-item").count();

        // Click the add item button
        await page.click('button:has-text("Add Item")');

        // Wait for the new item to be added
        await page.waitForTimeout(300);

        // Get the number of items after adding
        const itemCountAfter = await page.locator(".outliner-item").count();

        // Check that the item was added
        expect(itemCountAfter).toBeGreaterThan(itemCountBefore);
    });
});
