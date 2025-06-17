/** @feature MUL-0000 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("MUL-0000: multi cursor", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Alt+Clickで複数カーソルを追加できる", async ({ page }) => {
        const id1 = await TestHelpers.getItemIdByIndex(page, 0);
        const id2 = await TestHelpers.getItemIdByIndex(page, 1);

        await page.locator(`.outliner-item[data-item-id="${id1}"] .item-content`).click();
        await page.keyboard.type("Item 1 for multi-cursor test");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Item 2 for multi-cursor test");
        await expect(page.locator('.outliner-item')).toHaveCount(2);

        const cursorSelector = ".editor-overlay .cursor";

        await page.locator(`.outliner-item[data-item-id="${id1}"] .item-text`).click({ modifiers: ['Alt'] });
        await expect(page.locator(cursorSelector)).toHaveCount(1, { timeout: 7000 });

        await page.locator(`.outliner-item[data-item-id="${id2}"] .item-text`).click({ modifiers: ['Alt'] });
        await expect(page.locator(cursorSelector)).toHaveCount(2, { timeout: 7000 });

        await page.locator(`.outliner-item[data-item-id="${id1}"] .item-text`).click({ modifiers: ['Alt'] });
        await expect(page.locator(cursorSelector)).toHaveCount(2, { timeout: 7000 });
    });
});
