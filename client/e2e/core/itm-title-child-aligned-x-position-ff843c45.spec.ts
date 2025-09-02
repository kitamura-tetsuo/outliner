/** @feature ITM-ff843c45
 *  Title   : タイトルと子アイテムの水平位置を揃える
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-ff843c45: タイトルと子アイテムの位置", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    test("タイトルと子アイテムのX座標が同じ", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        const titleId = await TestHelpers.getItemIdByIndex(page, 0);

        await TestHelpers.setCursor(page, titleId!);

        await TestHelpers.insertText(page, titleId!, "Title text");

        await page.keyboard.press("Enter");

        await TestHelpers.waitForCursorVisible(page);

        const childId = await TestHelpers.getItemIdByIndex(page, 1);

        await TestHelpers.insertText(page, childId!, "Child item");

        await page.waitForTimeout(300);

        const titleBox = await page.locator(`.outliner-item[data-item-id="${titleId}"]`).boundingBox();

        const childBox = await page.locator(`.outliner-item[data-item-id="${childId}"]`).boundingBox();
        expect(Math.abs((titleBox?.x || 0) - (childBox?.x || 0))).toBeLessThan(1);
    });
});
