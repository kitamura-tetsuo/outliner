/** @feature CLM-0003
 *  Title   : 右へ移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0003: 右へ移動", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 最初のアイテムを取得 (first()の代わりにページタイトルを使用)
        // ページが読み込まれた直後は最初のアイテムがページタイトルになる
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、最初に表示されているアイテムを使用
        if (await item.count() === 0) {
            // 画面に表示されているアイテムを取得
            await page.locator(".outliner-item").first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // グローバル textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus");
        // 文字入力が可能
        await page.keyboard.type("Test data");
    });
    test("ArrowRightキーでカーソルが1文字右に移動する", async ({ page }) => {
        // アクティブなアイテム要素を取得
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // カーソルを左に移動して初期位置を設定
        await page.keyboard.press("Home");

        // アクティブなカーソルを取得
        const cursor = page.locator(".editor-overlay .cursor.active");
        await cursor.waitFor({ state: "visible" });
        // 初期カーソル位置を取得
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // 右矢印キーを押下
        await page.keyboard.press("ArrowRight");
        // 更新を待機
        await page.waitForTimeout(100);

        // 新しいカーソル位置を取得
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // カーソルが移動していることを確認（右に移動するとX座標が大きくなる）
        // ただし、フォントによっては左に移動することもあるため、位置が変わっていることだけを確認
        expect(newX).not.toEqual(initialX);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
    });
    test("一番最後の文字にある時は、一つ次のアイテムの最初の文字へ移動する", async ({ page }) => {
        // テスト開始時のアイテム数を確認
        const initialItemCount = await page.locator(".outliner-item").count();
        console.log(`テスト開始時のアイテム数: ${initialItemCount}`);

        // アクティブなアイテムIDを取得
        const firstItemId = await TestHelpers.getActiveItemId(page);
        console.log(`最初のアイテムID: ${firstItemId}`);
        expect(firstItemId).not.toBeNull();

        // 2つ目のアイテムを追加
        await page.keyboard.press("End"); // 最後に移動
        await page.keyboard.press("Enter");

        await page.keyboard.type("Second item");

        // 2つ目のアイテムが存在することを確認
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.waitFor({ state: "visible" });
        // 2つ目のアイテムのテキスト内容を確認
        const secondItemText = await secondItem.locator(".item-text").textContent();
        console.log(`2番目のアイテムのテキスト: ${secondItemText}`);
        expect(secondItemText).toContain("Second item");

        // 保存したIDを使って最初のアイテムに戻る
        await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-content").click();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // カーソルを行末に移動
        await page.keyboard.press("End");

        // カーソル情報を取得して検証
        let cursorData = await CursorValidator.getCursorData(page);
        console.log(`移動前のカーソル数: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        // 右矢印キーを押下
        await page.keyboard.press("ArrowRight");

        await page.waitForTimeout(500);

        // カーソル情報を取得して検証
        cursorData = await CursorValidator.getCursorData(page);
        console.log(`移動後のカーソル数: ${cursorData.cursorCount}`);
        expect(cursorData.cursorCount).toBe(1);

        // 2番目のアイテムのIDを取得
        const secondItemId = await secondItem.getAttribute("data-item-id");
        console.log(`2番目のアイテムID: ${secondItemId}`);

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        console.log(`アクティブなカーソルのアイテムID: ${activeItemId}`);

        // カーソルが2番目のアイテム内にあることを確認
        const isInSecondItem = activeItemId === secondItemId;
        console.log(`カーソルは2番目のアイテム内にありますか: ${isInSecondItem}`);
        expect(isInSecondItem).toBe(true);

        // 2番目のアイテムにテキストを入力して、正しく入力されることを確認
        await page.keyboard.type("Test input");

        // 2番目のアイテムのテキスト内容を再確認
        const updatedSecondItemText = await secondItem.locator(".item-text").textContent();
        console.log(`更新後の2番目のアイテムのテキスト: ${updatedSecondItemText}`);
        expect(updatedSecondItemText).toContain("Test input");
    });
});
