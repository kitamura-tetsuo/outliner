/** @feature ITM-ea76cd92
 *  Title   : Backspaceで前のアイテムと結合
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-ea76cd92: Backspace merge previous item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["First", "Second"]);
    });

    test("pressing Backspace at line start merges with previous item", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        const secondId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstId).not.toBeNull();
        expect(secondId).not.toBeNull();

        await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-content`).click({ force: true });
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Home");
        await page.keyboard.press("Backspace");
        await TestHelpers.waitForCursorVisible(page);
        await page.waitForTimeout(500);

        const activeId = await TestHelpers.getActiveItemId(page);
        expect(activeId).toBe(firstId);

        const mergedText = await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`).textContent();
        expect(mergedText).toBe("FirstSecond");

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursors[0].offset).toBe("First".length);
    });
});
