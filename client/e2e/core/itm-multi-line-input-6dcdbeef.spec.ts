/** @feature ITM-multi-line-input-6dcdbeef
 *  Title   : 複数行テキスト入力
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-multi-line-input-6dcdbeef: 複数行テキスト入力", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // start with an empty page so item indices are predictable
        await TestHelpers.prepareTestEnvironment(page, testInfo, []);
    });

    test("Enter キーで 3 行のアイテムが追加される", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        const items = page.locator(".outliner-item");
        const countBefore = await items.count();

        // ページタイトル（インデックス0）ではなく、通常のアイテム（インデックス1）を使用
        // まず、ページタイトルにEnterを押して子アイテムを作成
        const titleId = await TestHelpers.getItemIdByIndex(page, 0);
        await page.locator(`.outliner-item[data-item-id="${titleId}"] .item-content`).click({ force: true });
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.waitForTimeout(500);

        // 新しく作成された子アイテムを使用
        const firstChildId = await TestHelpers.getItemIdByIndex(page, 1);
        await page.locator(`.outliner-item[data-item-id="${firstChildId}"] .item-content`).click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力してEnterキーで新しいアイテムを作成
        await page.keyboard.type("Line 1");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.waitForTimeout(500);

        await page.keyboard.type("Line 2");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.waitForTimeout(500);

        await page.keyboard.type("Line 3");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.waitForTimeout(500);

        const countAfter = await items.count();

        // 最初に1つ子アイテムを作成し、その後3つ追加したので、合計4つ増加
        expect(countAfter).toBe(countBefore + 4);

        // 作成されたアイテムのIDを取得（インデックス1, 2, 3が対象）
        const id1 = await TestHelpers.getItemIdByIndex(page, 1);
        const id2 = await TestHelpers.getItemIdByIndex(page, 2);
        const id3 = await TestHelpers.getItemIdByIndex(page, 3);

        await expect(page.locator(`.outliner-item[data-item-id="${id1}"] .item-text`)).toHaveText("Line 1");
        await expect(page.locator(`.outliner-item[data-item-id="${id2}"] .item-text`)).toHaveText("Line 2");
        await expect(page.locator(`.outliner-item[data-item-id="${id3}"] .item-text`)).toHaveText("Line 3");
    });

    test("Backspace 後の入力が正しく反映される", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // ページタイトル（インデックス0）ではなく、通常のアイテムを使用
        // まず、ページタイトルにEnterを押して子アイテムを作成
        const titleId = await TestHelpers.getItemIdByIndex(page, 0);
        await page.locator(`.outliner-item[data-item-id="${titleId}"] .item-content`).click({ force: true });
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.waitForTimeout(500);

        // さらに新しいアイテムを作成
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.waitForTimeout(500);

        const newId = await TestHelpers.getItemIdByIndex(page, 2);
        expect(newId).not.toBeNull();
        await TestHelpers.setCursor(page, newId!, 0);
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
import "../utils/registerAfterEachSnapshot";
