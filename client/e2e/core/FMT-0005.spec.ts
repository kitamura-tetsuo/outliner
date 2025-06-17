// File moved from disabled/, some tests are commented out pending refactor.
/** @feature FMT-0005
 *  Title   : Visual Studio Codeのコピー/ペースト仕様
 *  Source  : docs/client-features.yaml
 */

import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Visual Studio Codeのコピー/ペースト仕様に関するテスト
 *
 * このテストでは、Visual Studio Codeのコピー/ペースト仕様に準拠したクリップボード操作をテストします。
 * 実際のクリップボード操作は環境依存のため、テキスト入力のシミュレーションで代用します。
 */

test.describe("Visual Studio Codeのコピー/ペースト仕様", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * 基本的なページアクセスをテスト
     */
    test("基本的なページアクセス", async ({ page }) => {
        // アプリを開く
        await page.goto("/");

        // ページが読み込まれたことを確認（より一般的なセレクタを使用）
        await page.waitForSelector(".outliner-item, .page-title, .page-list", { timeout: 30000 });

        // スクリーンショットを撮影（デバッグ用）
        await page.screenshot({ path: "test-results/fmt-0005-page-access.png" });

        // ページのタイトルを確認
        const title = await page.title();
        expect(title).toBeTruthy();

        // ページ上に何らかの要素が存在することを確認
        const hasContent = await page.locator("body").textContent();
        expect(hasContent).toBeTruthy();
    });

    /**
     * シングルカーソルでのテキスト入力をテスト
     */
    test("シングルカーソルでのテキスト入力", async ({ page }) => {
        // アプリを開く
        await page.goto("/");

        // ページが読み込まれたことを確認
        await page.waitForSelector(".outliner-item, .page-title, .page-list", { timeout: 30000 });

        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるのを待つ
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力
        const testText = "テスト用テキスト";
        await page.keyboard.type(testText);

        // スクリーンショットを撮影（デバッグ用）
        await page.screenshot({ path: "test-results/fmt-0005-text-input.png" });

        // 結果を確認
        const itemText = await item.locator(".item-text").textContent();

        // 入力されたテキストが正しいことを確認
        expect(itemText).toContain(testText);
    });

    /**
     * 複数行テキストの入力をテスト
     */
    test("複数行テキストの入力", async ({ page }) => {
        // アプリを開く
        await page.goto("/");

        // ページが読み込まれたことを確認
        await page.waitForSelector(".outliner-item, .page-title, .page-list", { timeout: 30000 });

        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるのを待つ
        await TestHelpers.waitForCursorVisible(page);

        // 複数行のテキストを入力
        await page.keyboard.type("1行目");
        await page.keyboard.press("Enter");
        await page.keyboard.type("2行目");
        await page.keyboard.press("Enter");
        await page.keyboard.type("3行目");

        // スクリーンショットを撮影（デバッグ用）
        await page.screenshot({ path: "test-results/fmt-0005-multiline-text.png" });

        // 結果を確認
        const items = page.locator(".outliner-item");
        const count = await items.count();

        // 3つのアイテムが作成されていることを確認
        expect(count).toBeGreaterThanOrEqual(3);

        // 各アイテムのテキストが正しいことを確認（可能な場合）
        if (count >= 3) {
            const id1 = await TestHelpers.getItemIdByIndex(page, 0);
            const id2 = await TestHelpers.getItemIdByIndex(page, 1);
            const id3 = await TestHelpers.getItemIdByIndex(page, 2);
            const text1 = await page.locator(`[data-item-id="${id1}"] .item-text`).textContent();
            const text2 = await page.locator(`[data-item-id="${id2}"] .item-text`).textContent();
            const text3 = await page.locator(`[data-item-id="${id3}"] .item-text`).textContent();

            // テキストが含まれていることを確認（完全一致でなくても可）
            expect(text1).toContain("1行目");
            expect(text2).toContain("2行目");
            expect(text3).toContain("3行目");
        }
    });

    /**
     * フォーマット文字列の入力をテスト
     */
    test("フォーマット文字列の入力", async ({ page }) => {
        // アプリを開く
        await page.goto("/");

        // ページが読み込まれたことを確認
        await page.waitForSelector(".outliner-item, .page-title, .page-list", { timeout: 30000 });

        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるのを待つ
        await TestHelpers.waitForCursorVisible(page);

        // フォーマット文字列を入力
        const formattedText = "これは[[太字]]と[/斜体]と[-取り消し線]と`コード`です";
        await page.keyboard.type(formattedText);

        // スクリーンショットを撮影（デバッグ用）
        await page.screenshot({ path: "test-results/fmt-0005-formatted-text.png" });

        // 結果を確認
        const itemText = await item.locator(".item-text").textContent();

        // 入力されたテキストが正しいことを確認
        expect(itemText).toContain("これは");
        expect(itemText).toContain("太字");
        expect(itemText).toContain("斜体");
        expect(itemText).toContain("取り消し線");
        expect(itemText).toContain("コード");

        // 別のアイテムを作成してフォーカスを外す（フォーマットが適用されるのを確認）
        await page.keyboard.press("Enter");
        await page.keyboard.type("別のアイテム");

        // スクリーンショットを撮影（フォーマット適用後）
        await page.screenshot({ path: "test-results/fmt-0005-formatted-text-applied.png" });
    });

    /**
     * クリップボード操作（コピー＆ペースト）をテスト
     */
    test("クリップボード操作（コピー＆ペースト）", async ({ page, context }) => {
        // クリップボードへのアクセス権限を付与
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);

        // アプリを開く
        await page.goto("/");
        await TestHelpers.waitForOutlinerItems(page); // Ensure page is loaded

        // 最初のアイテムを選択し、編集モードに入る
        const firstItem = page.locator(".outliner-item").first();
        const firstItemContent = firstItem.locator(".item-content");
        await firstItemContent.click();
        await TestHelpers.waitForCursorVisible(page);

        const textToCopy = "これはコピーするテキストです。";
        await page.keyboard.type(textToCopy);

        // テキストを全選択 (Ctrl+A or Cmd+A)
        const isMac = process.platform === "darwin";
        await page.keyboard.press(isMac ? "Meta+A" : "Control+A");

        // コピー (Ctrl+C or Cmd+C)
        await page.keyboard.press(isMac ? "Meta+C" : "Control+C");

        // Verify clipboard content using page.evaluate
        const copiedText = await page.evaluate(async () => {
            try {
                return await navigator.clipboard.readText();
            } catch (err) {
                console.error("Failed to read clipboard:", err);
                return null;
            }
        });
        expect(copiedText).toBe(textToCopy);

        // 新しいアイテムを作成してフォーカス
        await page.keyboard.press("Enter"); // Create new item below
        await TestHelpers.waitForOutlinerItems(page, 2); // Wait for the second item
        const secondItemLocator = await TestHelpers.getItemLocatorByIndex(page, 1);
        const secondItemContent = secondItemLocator!.locator(".item-content");
        await secondItemContent.click(); // Focus the new item
        await TestHelpers.waitForCursorVisible(page); // Ensure cursor is in the new item

        // ペースト (Ctrl+V or Cmd+V)
        await page.keyboard.press(isMac ? "Meta+V" : "Control+V");

        // 少し待ってからテキスト内容を確認
        await page.waitForFunction(async (expectedText, id) => {
            const el = document.querySelector(`.outliner-item[data-item-id="${id}"] .item-text`);
            return el?.textContent?.includes(expectedText);
        }, textToCopy, await TestHelpers.getItemIdByIndex(page, 1), { timeout: 5000 });

        await expect(secondItemLocator!.locator(".item-text")).toHaveText(textToCopy);
    });

    /**
     * ClipboardEventを使用したコピー＆ペーストをテスト
     */
    test("Clipboard APIを使用したペースト", async ({ page }) => {
        // アプリを開く
        await page.goto("/");

        // ページが読み込まれたことを確認
        await page.waitForSelector(".outliner-item, .page-title, .page-list", { timeout: 30000 });

        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // カーソルが表示されるのを待つ
        await TestHelpers.waitForCursorVisible(page);

        // テキストを入力
        const testText = "コピー元テキスト";
        await page.keyboard.type(testText);

        // 新しいアイテムを作成
        await page.keyboard.press("Enter");
        await TestHelpers.waitForOutlinerItems(page, 2);

        // クリップボードにテキストを書き込む
        const pasteText = "ペーストされたテキスト";
        await page.evaluate(async (text) => {
            await navigator.clipboard.writeText(text);
        }, pasteText);

        // 2番目のアイテムがフォーカスされている状態でペースト
        const isMac = process.platform === "darwin";
        await page.keyboard.press(isMac ? "Meta+V" : "Control+V");

        // 結果を確認
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        const secondId = await TestHelpers.getItemIdByIndex(page, 1);
        const firstItemText = await page.locator(`[data-item-id="${firstId}"] .item-text`).textContent();
        const secondItemText = await page.locator(`[data-item-id="${secondId}"] .item-text`).textContent();

        // 各アイテムのテキストが正しいことを確認
        expect(firstItemText).toBe(testText);
        expect(secondItemText).toBe(pasteText);
    });

});
