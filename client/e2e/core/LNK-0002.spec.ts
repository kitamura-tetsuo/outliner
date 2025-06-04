import {
    expect,
    test,
} from "@playwright/test";
import { waitForCursorVisible } from "../helpers";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @file LNK-0002.spec.ts
 * @description 内部リンクのナビゲーション機能の実際の動作テスト
 * 内部リンクが正しく機能することを確認します。
 * @playwright
 * @title 内部リンクのナビゲーション機能の実際の動作
 */

test.describe("LNK-0002: 内部リンクのナビゲーション機能の実際の動作", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase 内部リンクが正しく機能する
     * @description 内部リンクが正しく機能することを確認するテスト
     */
    test("内部リンクが正しく機能する", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await waitForCursorVisible(page);

        // 内部リンクテキストを入力
        await page.keyboard.type("[test-page]");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await waitForCursorVisible(page);

        // 別のテキストを入力
        await page.keyboard.type("別のアイテム");

        // 3つ目のアイテムをクリック（カーソルを最初のアイテムから離す）
        await page.keyboard.press("Enter");
        await waitForCursorVisible(page);
        await page.keyboard.type("3つ目のアイテム");

        // 少し待機してリンクが表示されるのを待つ
        await page.waitForTimeout(500);

        // 内部リンクを取得
        const internalLink = page.locator("a.internal-link").first();

        // リンクのhref属性を取得
        const href = await internalLink.getAttribute("href");
        expect(href).toBe("/test-page");

        // リンクのtarget属性を確認（新しいタブで開くかどうか）
        const target = await internalLink.getAttribute("target");
        expect(target).toBeNull(); // 同じタブで開く場合はtarget属性がない

        // リンクのクラスを確認
        const className = await internalLink.getAttribute("class");
        expect(className).toContain("internal-link");

        // リンクのテキストを確認
        const text = await internalLink.textContent();
        expect(text).toBe("test-page");
    });

    /**
     * @testcase プロジェクト内部リンクが正しく機能する
     * @description プロジェクト内部リンク（/project-name/page-name形式）が正しく機能することを確認するテスト
     */
    test("プロジェクト内部リンクが正しく機能する", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await waitForCursorVisible(page);

        // プロジェクト内部リンクを入力
        await page.keyboard.type("[/project-name/page-name]");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await waitForCursorVisible(page);

        // 別のテキストを入力
        await page.keyboard.type("別のアイテム");

        // 3つ目のアイテムをクリック（カーソルを最初のアイテムから離す）
        await page.keyboard.press("Enter");
        await waitForCursorVisible(page);
        await page.keyboard.type("3つ目のアイテム");

        // 少し待機してリンクが表示されるのを待つ
        await page.waitForTimeout(500);

        // プロジェクト内部リンクを取得
        const projectLink = page.locator("a.internal-link.project-link").first();

        // リンクのhref属性を取得
        const href = await projectLink.getAttribute("href");
        expect(href).toBe("/project-name/page-name");

        // リンクのtarget属性を確認（新しいタブで開くかどうか）
        const target = await projectLink.getAttribute("target");
        expect(target).toBeNull(); // 同じタブで開く場合はtarget属性がない

        // リンクのクラスを確認
        const className = await projectLink.getAttribute("class");
        expect(className).toContain("internal-link");
        expect(className).toContain("project-link");

        // リンクのテキストを確認
        const text = await projectLink.textContent();
        expect(text).toBe("project-name/page-name");
    });

    /**
     * @testcase 内部リンクのURLが正しく生成される
     * @description 内部リンクのURLが正しく生成されることを確認するテスト
     */
    test("内部リンクのURLが正しく生成される", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await waitForCursorVisible(page);

        // 様々な形式の内部リンクを入力
        await page.keyboard.type("[simple-page]");
        await page.keyboard.press("Enter");
        await waitForCursorVisible(page);

        await page.keyboard.type("[/project/page]");
        await page.keyboard.press("Enter");
        await waitForCursorVisible(page);

        await page.keyboard.type("[/multi/level/path/page]");
        await page.keyboard.press("Enter");
        await waitForCursorVisible(page);

        // カーソルを外して内部リンクを表示
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

        // 各リンクのhref属性を確認
        const links = await page.locator("a.internal-link").all();

        // 期待するリンクを順序に関係なく確認
        const hrefs = [];
        for (let i = 0; i < links.length; i++) {
            const href = await links[i].getAttribute("href");
            hrefs.push(href);
        }

        // 期待するhrefが含まれていることを確認
        expect(hrefs).toContain("/simple-page");
        expect(hrefs).toContain("/project/page");
        expect(hrefs).toContain("/multi/level/path/page");
    });
});
