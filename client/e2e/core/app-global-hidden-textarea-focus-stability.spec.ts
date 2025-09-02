/** @feature APP-0002
 *  Title   : 編集はグローバル隠しテキストエリアのみを使用
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase Enter後やアイテム間ナビゲーション後でもグローバル隠しtextareaへのフォーカスが維持される
 * @description 最初のアイテムで入力→Enterで新規アイテム→上下移動→引き続き入力 まで通して、常に textarea.global-textarea が document.activeElement であることを検証
 * @checks
 * - 最初のクリックでグローバルtextareaにフォーカスされる
 * - Enterで兄弟アイテム新規作成後もtextareaフォーカスが維持される
 * - 上下矢印キーでアイテムを移動してもtextareaフォーカスが維持される
 */

test.describe("APP-0002: Global hidden textarea focus stability", () => {
    test.afterEach(async ({ page }) => {
        await DataValidationHelpers.validateDataConsistency(page);
    });

    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Enterとナビゲーション後もフォーカス維持", async ({ page }) => {
        // 最初の可視アイテムをクリック
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });

        // カーソルが見えるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // 初期フォーカス確認
        await expect(page.locator("textarea.global-textarea")).toBeFocused();

        // テキストを入力
        await page.keyboard.type("Line1");

        // Enterで新規アイテム作成
        await page.keyboard.press("Enter");

        // 直後もフォーカス維持
        await expect(page.locator("textarea.global-textarea")).toBeFocused();

        // 下へ移動
        await page.keyboard.press("ArrowDown");
        await expect(page.locator("textarea.global-textarea")).toBeFocused();

        // 少し入力
        await page.keyboard.type("abc");

        // 上へ移動
        await page.keyboard.press("ArrowUp");
        await expect(page.locator("textarea.global-textarea")).toBeFocused();

        // さらに入力
        await page.keyboard.type("XYZ");

        // 最終状態: textareaがフォーカスされていること
        const focusInfo = await page.evaluate(() => {
            const ta = document.querySelector("textarea.global-textarea") as HTMLTextAreaElement | null;
            return {
                exists: !!ta,
                focused: document.activeElement === ta,
            };
        });

        expect(focusInfo.exists).toBe(true);
        expect(focusInfo.focused).toBe(true);
    });
});
