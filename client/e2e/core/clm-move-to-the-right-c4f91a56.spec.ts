import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0003
 *  Title   : 右へ移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0003: 右へ移動", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Test data", "Second item"]);
        await TestHelpers.waitForOutlinerItems(page, 10000, 3); // Title + 2 seeded items
    });

    test("ArrowRightキーでカーソルが1文字右に移動する", async ({ page }) => {
        // アクティブなアイテム要素を取得 (Item 1: "Test data")
        // Note: Item 0 is Title. Item 1 is "Test data".
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        await TestHelpers.setCursor(page, itemId!);

        // 初期カーソル情報を取得して検証
        let cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();

        // カーソルを左端に移動（Homeキー）
        await page.keyboard.press("Home");
        await page.waitForTimeout(300);

        // カーソル情報を再取得して検証
        cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();

        // カーソルが左端にあることを確認
        const initialOffset = cursorData.cursorInstances?.[0]?.offset;
        expect(initialOffset).not.toBeUndefined();

        // 右矢印キーを押下してカーソルを右に1文字移動
        await page.keyboard.press("ArrowRight");

        // 更新を待機
        await page.waitForTimeout(300);

        // 新しいカーソル情報を取得
        const updatedCursorData = await CursorValidator.getCursorData(page);
        const newOffset = updatedCursorData.cursorInstances?.[0]?.offset;

        // カーソルのオフセットが1文字分変化していることを確認（右に移動している）
        expect(newOffset).toBe(initialOffset + 1);

        // カーソル数が1つのままであることを確認
        expect(updatedCursorData.cursorCount).toBe(1);
    });

    test("一番最後の文字にある時は、一つ次のアイテムの最初の文字へ移動する", async ({ page }) => {
        // テスト開始時のアイテム数を確認
        const initialItemCount = await page.locator(".outliner-item").count();
        console.log(`テスト開始時のアイテム数: ${initialItemCount}`);

        // 最初のアイテムIDを取得 (Item 1)
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        console.log(`最初のアイテムID: ${firstItemId}`);
        expect(firstItemId).not.toBeNull();

        // 2つ目のアイテムが存在することを確認 (Item 2)
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 2);
        const secondItem = page.locator(`.outliner-item[data-item-id="${secondItemId}"]`);
        await secondItem.waitFor({ state: "visible" });

        // 2つ目のアイテムのテキスト内容を確認
        await expect(secondItem.locator(".item-text")).toContainText("Second item");

        // 最初のアイテムにカーソルをセット
        await TestHelpers.setCursor(page, firstItemId!);

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // カーソルを行末に移動
        await page.keyboard.press("End");

        // 少し長めに待機してカーソル移動を確定 - Endキー処理の完了を待つ
        await page.waitForTimeout(500);

        // カーソル情報を取得して、実際に末尾に移動したことを確認
        let cursorData = await CursorValidator.getCursorData(page);
        console.log(`Endキー移動後のカーソル数: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        const initialItemId = cursorData.activeItemId;
        const initialOffset = cursorData.cursorInstances?.[0]?.offset;
        const initialText = await page.locator(`.outliner-item[data-item-id="${initialItemId}"] .item-text`)
            .textContent();
        console.log(
            `移動前: アイテムID=${initialItemId}, オフセット=${initialOffset}, テキスト長=${initialText?.length}`,
        );

        // 確認：カーソルが実際に末尾にあるか（テキスト長とオフセットが一致するか）
        expect(initialOffset).toBe(initialText?.length);

        // もう一度Endキーを押してカーソル位置を確実に末尾にする
        await page.keyboard.press("End");
        await page.waitForTimeout(200);

        // 再度確認
        cursorData = await CursorValidator.getCursorData(page);
        const confirmedOffset = cursorData.cursorInstances?.[0]?.offset;
        console.log(`再確認: オフセット=${confirmedOffset}, テキスト長=${initialText?.length}`);
        expect(confirmedOffset).toBe(initialText?.length);

        // 右矢印キーを押下
        await page.keyboard.press("ArrowRight");

        // Rather than waiting for a fixed time, let's check if the cursor position changes
        // Wait up to 1 second for any possible change to occur
        await page.waitForTimeout(1000);

        // Check cursor information after the key press
        cursorData = await CursorValidator.getCursorData(page);
        console.log(`ArrowRight後のカーソル数: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        const updatedItemId = cursorData.activeItemId;
        const updatedOffset = cursorData.cursorInstances?.[0]?.offset;
        console.log(`移動後のアイテムID: ${updatedItemId}, オフセット: ${updatedOffset}`);

        // 2番目のアイテムのIDを取得 (already retrieved)
        console.log(`2番目のアイテムID: ${secondItemId}`);

        // The expected behavior is that when pressing ArrowRight at the end of an item,
        // the cursor should move to the next item at the beginning (offset 0)
        // If the functionality is not working as expected, we need to document this
        expect(updatedItemId).toBe(secondItemId);
        expect(updatedOffset).toBe(0);

        // 2番目のアイテムにテキストを入力して、正しく入力されることを確認
        await page.keyboard.type("Test input");

        // 2番目のアイテムのテキスト内容を再確認
        await expect(secondItem.locator(".item-text")).toContainText("Test input");
    });
});
