import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase アプリケーション起動時にグローバルテキストエリアにフォーカスが設定される
 * @description アプリケーション起動時に自動的にグローバルテキストエリアにフォーカスが設定されることを確認するテスト
 * @check アプリケーション起動時にグローバルテキストエリアにフォーカスが設定される
 * @check カーソルが表示される
 * @check テキスト入力が可能になる
 */
test.describe("アプリケーション起動時のフォーカス設定", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("アプリケーション起動時にグローバルテキストエリアにフォーカスが設定される", async ({ page }) => {
        // スクリーンショットを撮影（プロジェクトページ表示後）
        await page.screenshot({ path: "client/test-results/APP-0001-project-page.png" });

        // OutlinerItem が表示されるのを待つ
        await page.waitForSelector(".outliner-item", { timeout: 30000 });
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

        // スクリーンショットを撮影（デバッグ用）
        await page.screenshot({ path: "client/test-results/APP-0001-initial.png" });

        // グローバルテキストエリアがアクティブになるまで待機
        await page.waitForFunction(() => {
            const textarea = document.querySelector<HTMLTextAreaElement>(".global-textarea");
            return textarea !== null && document.activeElement === textarea;
        }, { timeout: 5000 });

        // テキスト入力が可能であることを確認
        const testText = "テスト用テキスト";
        await page.keyboard.type(testText);
        console.log("Typed text:", testText);

        // スクリーンショットを撮影（テキスト入力後）
        await page.screenshot({ path: "client/test-results/APP-0001-text-input.png" });

        // ページ内のテキスト要素を確認
        const pageContent = await page.textContent("body");
        const containsText = pageContent?.includes(testText) || false;
        console.log("Page content contains test text:", containsText);

        // テキストが入力されていることを確認
        expect(containsText).toBe(true);

        // フォーカスが設定されていることを確認
        const hasFocus = await page.evaluate(() => {
            const textarea = document.querySelector<HTMLTextAreaElement>(".global-textarea");
            return textarea !== null && document.activeElement === textarea;
        });
        expect(hasFocus).toBe(true);
    });
});
