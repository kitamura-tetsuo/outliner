import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Reproduction of double-input bug", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Prepare test environment with one empty line
        await TestHelpers.prepareTestEnvironment(page, testInfo, [""]);
    });

    test("typing 'abc' results in 'abc' and not 'aabbcc'", async ({ page }) => {
        // Wait for the item to be visible and editable
        // prepareTestEnvironment creates page title + lines.
        // We pass [""] so we expect 2 items (title + empty item).
        await TestHelpers.waitForOutlinerItems(page, 2);

        // Select the first regular item (not the page title)
        const itemSelector = ".outliner-item:not(.page-title)";

        // Wait for the item to be visible
        await page.waitForSelector(itemSelector);

        // Click to focus
        await page.click(itemSelector);

        // Wait for cursor to be ready (ensures focus and visibility)
        await TestHelpers.ensureCursorReady(page);

        // Type "abc"
        const textToType = "abc";
        await page.keyboard.type(textToType);

        // Wait for UI to stabilize
        await TestHelpers.waitForUIStable(page);

        // Assert the text
        const textElement = page.locator(`${itemSelector} .item-text`).first();
        await expect(textElement).toHaveText(textToType);
    });
});
