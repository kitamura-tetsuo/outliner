import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0002
 *  Title   : フォーマット組み合わせ
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("フォーマット組み合わせ", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("太字と斜体の組み合わせが正しく表示される", async ({ page }) => {
        // prepareTestEnvironment の lines パラメータでデータを作成
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "これは[[太字と[/ 斜体]の組み合わせ]]です",
        ]);

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 2番目のアイテム(ページタイトルではない最初のアイテム)を取得
        const firstItem = page.locator(".outliner-item").nth(1);

        // .item-text要素のHTMLを取得
        const firstItemHtml = await firstItem.locator(".item-text").first().innerHTML();

        // 太字と斜体の組み合わせが正しく表示されていることを確認
        expect(firstItemHtml).toContain("<strong>");
        expect(firstItemHtml).toContain("太字と");
        expect(firstItemHtml).toContain("<em>");
        expect(firstItemHtml).toContain("斜体");
        expect(firstItemHtml).toContain("</em>");
        expect(firstItemHtml).toContain("の組み合わせ");
        expect(firstItemHtml).toContain("</strong>");
    });

    test("太字と取り消し線の組み合わせが正しく表示される", async ({ page }) => {
        // prepareTestEnvironment の lines パラメータでデータを作成
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "これは[[太字と[-取り消し線]の組み合わせ]]です",
        ]);

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 2番目のアイテム(ページタイトルではない最初のアイテム)のHTMLを確認
        const firstItemHtml = await page.locator(".outliner-item").nth(1).locator(".item-text").first().innerHTML();

        // 太字と取り消し線の組み合わせが正しく表示されていることを確認
        expect(firstItemHtml).toContain("<strong>");
        expect(firstItemHtml).toContain("太字と");
        expect(firstItemHtml).toContain("<s>");
        expect(firstItemHtml).toContain("取り消し線");
        expect(firstItemHtml).toContain("</s>");
        expect(firstItemHtml).toContain("の組み合わせ");
        expect(firstItemHtml).toContain("</strong>");
    });

    test("斜体とコードの組み合わせが正しく表示される", async ({ page }) => {
        // prepareTestEnvironment の lines パラメータでデータを作成
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "これは[/ 斜体と`コード`の組み合わせ]です",
        ]);

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 2番目のアイテム(ページタイトルではない最初のアイテム)のHTMLを確認
        const firstItemHtml = await page.locator(".outliner-item").nth(1).locator(".item-text").first().innerHTML();

        // 斜体とコードの組み合わせが正しく表示されていることを確認
        expect(firstItemHtml).toContain("<em>");
        expect(firstItemHtml).toContain("斜体と");
        expect(firstItemHtml).toContain("<code>");
        expect(firstItemHtml).toContain("コード");
        expect(firstItemHtml).toContain("</code>");
        expect(firstItemHtml).toContain("の組み合わせ");
        expect(firstItemHtml).toContain("</em>");
    });

    test("複数のフォーマットが入れ子になっている場合も正しく表示される", async ({ page }) => {
        // prepareTestEnvironment の lines パラメータでデータを作成
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "これは[[太字と[/ 斜体と[-取り消し線]と`コード`]]]です",
        ]);

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 2番目のアイテム(ページタイトルではない最初のアイテム)のHTMLを確認
        const firstItemHtml = await page.locator(".outliner-item").nth(1).locator(".item-text").first().innerHTML();

        // 複雑な組み合わせが正しく表示されていることを確認
        expect(firstItemHtml).toContain("<strong>");
        expect(firstItemHtml).toContain("太字と");
        expect(firstItemHtml).toContain("<em>");
        expect(firstItemHtml).toContain("斜体と");
        expect(firstItemHtml).toContain("<s>");
        expect(firstItemHtml).toContain("取り消し線");
        expect(firstItemHtml).toContain("</s>");
        expect(firstItemHtml).toContain("<code>");
        expect(firstItemHtml).toContain("コード");
        expect(firstItemHtml).toContain("</code>");
        expect(firstItemHtml).toContain("</em>");
        expect(firstItemHtml).toContain("</strong>");
    });

    test("カーソルがあるアイテムでは組み合わせフォーマットもプレーンテキストで表示される", async ({ page }) => {
        // prepareTestEnvironment の lines パラメータでデータを作成
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "これは[[太字と[/ 斜体と[-取り消し線]と`コード`]]]です",
        ]);

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // ページタイトルではない最初のアイテムを選択
        const item = page.locator(".outliner-item").nth(1);
        await item.locator(".item-content").click();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // カーソルがあるアイテムのHTMLを確認
        const itemHtml = await page.locator(".outliner-item").nth(1).locator(".item-text").first().innerHTML();

        // 制御文字が表示されていることを確認
        expect(itemHtml).toContain('<span class="control-char">[</span>');
        expect(itemHtml).toContain('<span class="control-char">/</span>');
        expect(itemHtml).toContain('<span class="control-char">-</span>');
        expect(itemHtml).toContain('<span class="control-char">`</span>');

        // テキスト内容も確認
        const itemText = await page.locator(".outliner-item").nth(1).locator(".item-text").first().textContent();
        expect(itemText).toContain("これは[[太字と[/ 斜体と[-取り消し線]と`コード`]]]です");
    });
});
