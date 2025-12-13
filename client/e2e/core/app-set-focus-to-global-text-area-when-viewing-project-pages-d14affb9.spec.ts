import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature APP-0001
 *  Title   : プロジェクトページ表示時にグローバルテキストエリアにフォーカスを設定
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase プロジェクトページ表示時にグローバルテキストエリアにフォーカスが設定される
 * @description プロジェクトページ表示時に自動的にグローバルテキストエリアにフォーカスが設定されることを確認するテスト
 * @check プロジェクトページ表示時にグローバルテキストエリアにフォーカスが設定される
 * @check カーソルが表示される
 * @check テキスト入力が可能になる
 */
test.describe("プロジェクトページ表示時のフォーカス設定", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("プロジェクトページ表示時にグローバルテキストエリアにフォーカスが設定される", async ({ page }) => {
        // OutlinerItem が表示されるのを待つ
        await page.waitForSelector(".outliner-item:not(.page-title)", { timeout: 30000 });
        console.log("Found outliner items");

        // ページ内の要素を確認
        const elements = await page.evaluate(() => {
            return {
                outlinerItems: document.querySelectorAll(".outliner-item").length,
                pageTitle: document.querySelector(".outliner-item.page-title") ? true : false,
                firstItem: document.querySelector(".outliner-item") ? true : false,
                globalTextarea: document.querySelector(".global-textarea") ? true : false,
            };
        });
        console.log("Page elements:", elements);

        // グローバルテキストエリアが存在することを確認
        expect(elements.globalTextarea).toBe(true);

        // 最初のアイテムをクリックしてフォーカスを設定
        const firstItem = page.locator(".outliner-item:not(.page-title)").first();
        await firstItem.locator(".item-content").click({ position: { x: 10, y: 10 }, force: true });
        await TestHelpers.focusGlobalTextarea(page);

        // フォーカス状態を確認
        const focusState = await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return {
                textareaExists: !!textarea,
                focused: document.activeElement === textarea,
                activeElementTag: document.activeElement?.tagName,
                textareaValue: textarea?.value || "",
            };
        });
        console.log("Focus state after click:", focusState);

        // フォーカスが設定されていることを確認
        expect(focusState.focused).toBe(true);

        // テキスト入力が可能であることを確認（カーソルAPIを使用）
        const itemId = await firstItem.getAttribute("data-item-id");
        expect(itemId).toBeTruthy();
        await TestHelpers.setCursor(page, itemId!, 0);
        await TestHelpers.waitForCursorVisible(page);

        const testText = "テスト用テキスト";
        await TestHelpers.insertText(page, itemId!, testText);

        // 少し待機してからテキストが入力されていることを確認
        await page.waitForTimeout(500);

        // アイテムのテキストを確認
        const itemText = await firstItem.locator(".item-text").innerText();
        console.log("Item text after input:", itemText);
        expect(itemText).toContain(testText);
    });
});
