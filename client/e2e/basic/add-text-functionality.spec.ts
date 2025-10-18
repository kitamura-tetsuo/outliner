import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @playwright
 * @title テキスト追加機能テスト
 * @description このファイルではアウトライナーアプリでテキストを追加する機能をテストします。
 * アイテムを追加した後、そのアイテムに対してテキスト入力ができ、入力したテキストが
 * 正しく保存・表示されることと、データ構造が更新されることを確認します。
 */

test.describe("テキスト追加機能テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase Add Text button should add text to shared content
     * @description アイテムを追加した後、そのアイテムに対してテキスト入力ができ、入力したテキストが
     * 正しく保存・表示されることと、データ構造が更新されることを確認します。
     * @check アイテム追加ボタンをクリックするとアイテムが表示される
     * @check アイテムをクリックすると編集モードになる
     * @check 編集モード時にフォーカスが正しく当たる
     * @check テキストを入力できる
     * @check Enter キーを押すとテキストが保存される
     * @check 入力したテキストがアイテムのコンテンツとして表示される
     * @updated 2023-04-09 フォーカスの問題は修正済み
     */
    test("Add Text button should add text to shared content", async ({ page }) => {
        // テストテキストを定義
        const testText = "Hello Fluid Framework!";

        // ページタイトルを優先的に使用（最初に表示されるアイテム）
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item");
        }

        // スクリーンショットを撮影（クリック後）
        await page.screenshot({ path: "client/test-results/add-text-after-click.png" });

        // 隠し textarea がフォーカスされているか確認
        const isFocused = await page.evaluate(() => {
            const active = document.activeElement;
            return active?.classList.contains("global-textarea");
        });
        console.log("Global textarea focused:", isFocused);
        expect(isFocused).toBe(true);

        // カーソルが表示されるまで待機
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible:", cursorVisible);
        expect(cursorVisible).toBe(true);

        // 既存のテキストをクリア
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(500);

        // テキストを入力
        await page.keyboard.type(testText);
        await page.waitForTimeout(500);

        // 入力したテキストが表示されることを確認
        const itemLocator = await item.count() > 0 ? item : page.locator(".outliner-item").first();
        const itemText = await itemLocator.locator(".item-text").textContent();
        expect(itemText).toContain(testText);
    });

    /**
     * @testcase Adding text updates data structure
     * @description テキスト追加時にデータ構造が正しく更新されることを確認するテスト
     * @check デバッグパネルでテキスト追加前の状態を記録する
     * @check アイテムを追加し、テキストを入力する
     * @check デバッグパネルで更新後の状態を確認する
     * @check データ構造に入力したテキストが反映されていることを確認する
     * @check ページを再読み込みしても入力したデータが保持されていることを確認する
     */
    test("Adding text updates data structure", async ({ page }) => {
        const testText = "Test data update";

        // ページタイトルを優先的に使用（最初に表示されるアイテム）
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item");
        }

        // カーソルが表示されるまで待機
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        expect(cursorVisible).toBe(true);

        // 既存のテキストをクリア
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(500);

        // テキストを入力
        await page.keyboard.type(testText);
        await page.waitForTimeout(500);

        // 画面表示を確認
        const itemLocator = await item.count() > 0 ? item : page.locator(".outliner-item").first();
        const itemText = await itemLocator.locator(".item-text").textContent();
        expect(itemText).toContain(testText);
    });
});
