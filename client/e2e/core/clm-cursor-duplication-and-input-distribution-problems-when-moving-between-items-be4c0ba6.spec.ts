import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0101
 *  Title   : Cursor duplication and input distribution problems when moving between items
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Verify cursor duplication issue", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["", ""]);
    });

    test("Fixed: Verify only one cursor exists even when clicking between items", async ({ page }) => {
        const uniqueTextA = "unique-text-A";
        const uniqueTextB = "unique-text-B";

        // 1. Click the first item 3 times (test potential for duplicate cursor creation)
        await page.locator(".item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "After 1st click");

        await page.locator(".item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "After 2nd click");

        await page.locator(".item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "After 3rd click");

        // 2. Click the second item
        await page.locator("div:nth-child(2) > .outliner-item > .item-header > .item-content-container > .item-content")
            .click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "After clicking 2nd item");

        // 3. Type text "unique-text-A"
        await page.keyboard.type(uniqueTextA);
        await page.waitForTimeout(300); // Wait for text input to reflect
        await CursorValidator.validateCursorState(page, 1, "After text input");

        // 4. Verify text content of the second item
        const secondItemText = await page.locator("div:nth-child(2) > .outliner-item").locator(".item-text")
            .textContent();
        console.log(`Text of 2nd item: ${secondItemText}`);
        expect(secondItemText).toContain(uniqueTextA); // Verify 2nd item contains "unique-text-A"

        // 5. Verify text content of the first item
        const firstItemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();
        console.log(`Text of 1st item: ${firstItemText}`);
        expect(firstItemText).not.toContain(uniqueTextA); // Verify 1st item does not contain "unique-text-A"

        // 6. Click the first item
        await page.locator(".item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "After returning to 1st item");

        // 7. Type text "unique-text-B"
        await page.keyboard.type(uniqueTextB);
        await page.waitForTimeout(300); // Wait for text input to reflect
        await CursorValidator.validateCursorState(page, 1, "After 2nd text input");

        // 8. Verify text content of the first item
        const updatedFirstItemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();
        console.log(`Updated text of 1st item: ${updatedFirstItemText}`);
        expect(updatedFirstItemText).toContain(uniqueTextB); // Verify 1st item contains "unique-text-B"

        // 9. Re-verify text content of the second item
        const updatedSecondItemText = await page.locator("div:nth-child(2) > .outliner-item").locator(".item-text")
            .textContent();
        console.log(`Updated text of 2nd item: ${updatedSecondItemText}`);
        expect(updatedSecondItemText).not.toContain(uniqueTextB); // Verify 2nd item does not contain "unique-text-B"
        expect(updatedSecondItemText).toContain(uniqueTextA); // Verify 2nd item still contains "unique-text-A"

        // 10. Verify final cursor state (confirm only cursor existence regardless of blinking state)
        await CursorValidator.validateCursorState(page, 1, "At test end");
    });
});
