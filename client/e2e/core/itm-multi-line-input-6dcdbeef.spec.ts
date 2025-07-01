/** @feature ITM-0004
 *  Title   : 複数行テキスト入力
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-0004: 複数行テキスト入力", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // start with an empty page so item indices are predictable
        await TestHelpers.prepareTestEnvironment(page, testInfo, []);
    });

    test("Enter キーで 3 行のアイテムが追加される", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        const items = page.locator(".outliner-item");
        const countBefore = await items.count();

        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-content`).click({ force: true });
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.type("Line 1");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("Line 2");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("Line 3");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.waitForTimeout(500);

        const countAfter = await items.count();
        expect(countAfter).toBe(countBefore + 3);
        const id1 = await TestHelpers.getItemIdByIndex(page, 1);
        const id2 = await TestHelpers.getItemIdByIndex(page, 2);
        const id3 = await TestHelpers.getItemIdByIndex(page, 3);
        await expect(page.locator(`.outliner-item[data-item-id="${id1}"] .item-text`)).toHaveText("Line 1");
        await expect(page.locator(`.outliner-item[data-item-id="${id2}"] .item-text`)).toHaveText("Line 2");
        await expect(page.locator(`.outliner-item[data-item-id="${id3}"] .item-text`)).toHaveText("Line 3");
    });

    test("Backspace 後の入力が正しく反映される", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstId}"] .item-content`);
        await firstItem.click({ force: true });
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");

        // create a new empty item
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        const newId = await TestHelpers.getItemIdByIndex(page, 1);
        const newItem = page.locator(`.outliner-item[data-item-id="${newId}"] .item-content`);
        await newItem.click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        await page.keyboard.type("abc");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("d");
        await page.waitForTimeout(500);

        await expect(
            page.locator(`.outliner-item[data-item-id="${newId}"] .item-text`),
        ).toHaveText("abd");
    });
});
