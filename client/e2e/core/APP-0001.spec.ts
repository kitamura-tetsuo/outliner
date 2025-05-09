import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

/**
 * @testcase アプリケーション起動時にグローバルテキストエリアにフォーカスが設定される
 * @description アプリケーション起動時に自動的にグローバルテキストエリアにフォーカスが設定されることを確認するテスト
 * @check アプリケーション起動時にグローバルテキストエリアにフォーカスが設定される
 * @check カーソルが表示される
 * @check テキスト入力が可能になる
 */
test.describe("アプリケーション起動時のフォーカス設定", () => {
    test("アプリケーション起動時にグローバルテキストエリアにフォーカスが設定される", async ({ page }) => {
        // テスト開始前に十分な時間を設定
        test.setTimeout(60000);

        // テストページをセットアップ
        await TestHelpers.setupCursorDebugger(page);

        // ホームページにアクセス
        await page.goto("/");

        // ページが読み込まれたことを確認
        await page.waitForSelector(".outliner-item", { timeout: 30000 });

        // スクリーンショットを撮影（デバッグ用）
        await page.screenshot({ path: "test-results/APP-0001-initial.png" });

        // カーソルが表示されるのを待つ
        await TestHelpers.waitForCursorVisible(page);

        // スクリーンショットを撮影（カーソル表示後）
        await page.screenshot({ path: "test-results/APP-0001-cursor-visible.png" });

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.activeItemId).not.toBeNull();

        // グローバルテキストエリアにフォーカスが設定されていることを確認
        const hasFocus = await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea");
            return document.activeElement === textarea;
        });
        expect(hasFocus).toBe(true);

        // テキスト入力が可能であることを確認
        const testText = "テスト用テキスト";
        await page.keyboard.type(testText);

        // スクリーンショットを撮影（テキスト入力後）
        await page.screenshot({ path: "test-results/APP-0001-text-input.png" });

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // アクティブなアイテムのテキストを確認
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });
        const itemText = await activeItem.locator(".item-text").textContent();
        expect(itemText).toContain(testText);
    });
});
