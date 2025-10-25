import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0001
 *  Title   : フォーマット表示
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("フォーマット表示", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("カーソルがないアイテムではフォーマットされた内容が表示される", async ({ page }) => {
        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力
        await page.keyboard.type("これは[[太字]]のテキストです");

        // 別のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await page.keyboard.type("別のアイテム");

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 最初のアイテムのHTMLを確認
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // フォーマットされたHTMLを確認（制御文字は非表示、フォーマットは適用）
        expect(firstItemHtml).toContain("<strong>太字</strong>");
    });

    test("カーソルがあるアイテムではプレーンテキストの入力内容がそのまま表示される", async ({ page }) => {
        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力
        await page.keyboard.type("これは[[太字]]のテキストです");

        // カーソルがあるアイテムのテキストを確認
        const itemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();

        // 制御文字を含むテキストが表示されていることを確認
        // 注: 実際の実装では内部リンクとして解釈される可能性があるため、部分一致で確認
        expect(itemText).toContain("これは");
        expect(itemText).toContain("太字");
        expect(itemText).toContain("のテキストです");

        // 制御文字が表示されていることを確認
        const itemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();
        // 注: 実際の実装では制御文字の表示方法が異なる可能性があるため、部分一致で確認
        expect(itemHtml).toContain('class="control-char"');
    });

    test("太字フォーマット（[[text]]）が視覚的に太字で表示される", async ({ page }) => {
        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力
        await page.keyboard.type("これは[[太字]]のテキストです");

        // 別のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await page.keyboard.type("別のアイテム");

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 最初のアイテムのHTMLを確認
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // 太字フォーマットが適用されていることを確認
        expect(firstItemHtml).toContain("<strong>太字</strong>");
    });

    test("斜体フォーマット（[/ text]）が視覚的に斜体で表示される", async ({ page }) => {
        // prepareTestEnvironment の lines パラメータでデータを作成
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "これは[/ 斜体]のテキストです",
        ]);

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 最初のアイテム（ページタイトルではない）のHTMLを確認
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();
        const firstItemHtml = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text")
            .innerHTML();

        // 斜体フォーマットが適用されていることを確認
        expect(firstItemHtml).toContain("<em>斜体</em>");
    });

    test("取り消し線フォーマット（[- text]）が視覚的に取り消し線付きで表示される", async ({ page }) => {
        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力
        await page.keyboard.type("これは[-取り消し線]のテキストです");

        // 別のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await page.keyboard.type("別のアイテム");

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 最初のアイテムのHTMLを確認
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // 取り消し線フォーマットが適用されていることを確認
        expect(firstItemHtml).toContain("<s>取り消し線</s>");
    });

    test("コードフォーマット（`text`）が視覚的にコードスタイルで表示される", async ({ page }) => {
        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力
        await page.keyboard.type("これは`コード`のテキストです");

        // 別のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await page.keyboard.type("別のアイテム");

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 最初のアイテムのHTMLを確認
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // コードフォーマットが適用されていることを確認
        expect(firstItemHtml).toContain("<code>コード</code>");
    });

    test("アイテムをクリックするとプレーンテキストが表示される", async ({ page }) => {
        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力
        await page.keyboard.type("これは[[太字]]のテキストです");

        // 別のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await page.keyboard.type("別のアイテム");

        // 少し待機してフォーマットが適用されるのを待つ
        await page.waitForTimeout(500);

        // 最初のアイテムのHTMLを確認（フォーマットされている）
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();
        expect(firstItemHtml).toContain("<strong>太字</strong>");

        // 最初のアイテムをクリック
        await page.locator(".outliner-item").first().locator(".item-content").click();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // クリック後のHTMLを確認（制御文字が表示される）
        const afterClickHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // 注: 実際の実装では制御文字の表示方法が異なる可能性があるため、部分一致で確認
        expect(afterClickHtml).toContain('class="control-char"');

        // カーソルがあるアイテムのテキストを確認
        const itemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();

        // 制御文字を含むテキストが表示されていることを確認
        expect(itemText).toContain("これは");
        expect(itemText).toContain("太字");
        expect(itemText).toContain("のテキストです");
    });
});
