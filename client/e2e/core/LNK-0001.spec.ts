import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @file LNK-0001.spec.ts
 * @description 内部リンクのナビゲーション機能のテスト
 * 内部リンクのURLが正しく生成されることを確認します。
 * @playwright
 * @title 内部リンクのナビゲーション機能
 */

test.describe("LNK-0001: 内部リンクのナビゲーション機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    /**
     * @testcase 内部リンクのURLが正しく生成される
     * @description 内部リンクのURLが正しく生成されることを確認するテスト
     */
    test("内部リンクのURLが正しく生成される", async ({ page }) => {
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

        // 3つ目のアイテムをクリック（カーソルを最初のアイテムから離す）
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("3つ目のアイテム");

        // 少し待機してリンクが表示されるのを待つ
        await page.waitForTimeout(500);

        // 最初のアイテムのテキスト内容を確認（内部リンクが適用されていること）
        const firstItemText = await firstItem.locator(".item-text").innerHTML();

        // 内部リンクが適用されていることを確認
        expect(firstItemText).toContain("internal-link");
        expect(firstItemText).toContain("test-page");
        expect(firstItemText).toContain('href="/test-page"');

        // 2つ目のアイテムのテキスト内容を確認（プロジェクト内部リンクが適用されていること）
        const secondItem = page.locator(".outliner-item").nth(1);
        const secondItemText = await secondItem.locator(".item-text").innerHTML();

        // プロジェクト内部リンクが適用されていることを確認
        expect(secondItemText).toContain("project-name/page-name");
        expect(secondItemText).toContain('href="/project-name/page-name"');
    });

    /**
     * @testcase 内部リンクのHTMLが正しく生成される
     * @description 内部リンクのHTMLが正しく生成されることを確認するテスト
     */
    test("内部リンクのHTMLが正しく生成される", async ({ page }) => {
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

        // 3つ目のアイテムをクリック（カーソルを最初のアイテムから離す）
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("3つ目のアイテム");

        // 少し待機してリンクが表示されるのを待つ
        await page.waitForTimeout(500);

        // 最初のアイテムのHTML内容を確認
        const firstItemHTML = await firstItem.locator(".item-text").innerHTML();

        // 内部リンクのHTMLが正しく生成されていることを確認
        expect(firstItemHTML).toMatch(/<a href="\/test-page"[^>]*class="[^"]*internal-link[^"]*"[^>]*>test-page<\/a>/);

        // 2つ目のアイテムのHTML内容を確認
        const secondItem = page.locator(".outliner-item").nth(1);
        const secondItemHTML = await secondItem.locator(".item-text").innerHTML();

        // プロジェクト内部リンクのHTMLが正しく生成されていることを確認
        expect(secondItemHTML).toMatch(
            /<a href="\/project-name\/page-name"[^>]*class="[^"]*internal-link[^"]*"[^>]*>project-name\/page-name<\/a>/,
        );
    });
});
