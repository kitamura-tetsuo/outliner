import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

/**
 * @file FMT-0007.spec.ts
 * @description 内部リンク機能のテスト
 * 内部リンクの表示と機能をテストします。
 * @playwright
 * @title 内部リンク機能
 */

test.describe("FMT-0007: 内部リンク機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase 通常の内部リンク構文が正しく表示される
     * @description [page-name] 形式の内部リンクが正しく表示されることを確認するテスト
     */
    test("通常の内部リンク構文が正しく表示される", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 内部リンクテキストを入力
        await page.keyboard.type("[test-page]");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // 別のテキストを入力
        await page.keyboard.type("別のアイテム");

        // 3つ目のアイテムをクリック（カーソルを最初のアイテムから離す）
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("3つ目のアイテム");

        // 最初のアイテムのテキスト内容を確認（内部リンクが適用されていること）
        const firstItemText = await firstItem.locator(".item-text").innerHTML();

        // 内部リンクが適用されていることを確認
        expect(firstItemText).toContain("internal-link");
        expect(firstItemText).toContain("test-page");
        expect(firstItemText).toContain('href="/test-page"');
    });

    /**
     * @testcase プロジェクト内部リンク構文が正しく表示される
     * @description [/project-name/page-name] 形式の内部リンクが正しく表示されることを確認するテスト
     */
    test("プロジェクト内部リンク構文が正しく表示される", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // プロジェクト内部リンクテキストを入力
        await page.keyboard.type("[/project-name/page-name]");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // 別のテキストを入力
        await page.keyboard.type("別のアイテム");

        // 3つ目のアイテムをクリック（カーソルを最初のアイテムから離す）
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("3つ目のアイテム");

        // 最初のアイテムのテキスト内容を確認（内部リンクが適用されていること）
        const firstItemText = await firstItem.locator(".item-text").innerHTML();

        // 内部リンクが適用されていることを確認
        expect(firstItemText).toContain("internal-link");
        expect(firstItemText).toContain("project-link");
        expect(firstItemText).toContain("project-name/page-name");
        expect(firstItemText).toContain('href="/project-name/page-name"');
    });

    /**
     * @testcase カーソルがあるアイテムでは内部リンクがプレーンテキストで表示される
     * @description カーソルがあるアイテムでは内部リンクがプレーンテキストで表示されることを確認するテスト
     */
    test("カーソルがあるアイテムでは内部リンクがプレーンテキストで表示される", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 内部リンクテキストを入力
        await page.keyboard.type("[test-page]");

        // カーソルがあるアイテムのテキスト内容を確認（制御文字が表示されていること）
        const firstItemTextWithCursor = await firstItem.locator(".item-text").innerHTML();

        // 制御文字が表示されていることを確認
        expect(firstItemTextWithCursor).toContain('class="control-char">[');
        expect(firstItemTextWithCursor).toContain('class="control-char">]');
        expect(firstItemTextWithCursor).toContain('href="/test-page"');

        // 2つ目のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("別のアイテム");

        // 最初のアイテムのテキスト内容を確認（内部リンクが適用されていること）
        const firstItemTextWithoutCursor = await firstItem.locator(".item-text").innerHTML();

        // 内部リンクが適用されていることを確認
        expect(firstItemTextWithoutCursor).toContain("internal-link");
        expect(firstItemTextWithoutCursor).toContain("test-page");
        expect(firstItemTextWithoutCursor).toContain('href="/test-page"');
    });

    /**
     * @testcase 内部リンクのデータが正しく保存される
     * @description 内部リンクのデータが正しく保存されることを確認するテスト
     */
    test("内部リンクのデータが正しく保存される", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 通常の内部リンクを入力
        await page.keyboard.type("[test-page]");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // プロジェクト内部リンクを入力
        await page.keyboard.type("[/project-name/page-name]");

        // 少し待機してデータが反映されるのを待つ
        await page.waitForTimeout(500);

        // SharedTreeのデータを取得
        const treeData = await TreeValidator.getTreeData(page);

        // データが正しく保存されていることを確認
        expect(treeData.items[0].text).toBe("[test-page]");
        expect(treeData.items[0].items[0].text).toBe("[/project-name/page-name]");
    });
});
