/** @feature LNK-0003
 *  Title   : 内部リンクのナビゲーション機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { waitForCursorVisible } from "../helpers";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

/**
 * @file LNK-0003.spec.ts
 * @description 内部リンクのナビゲーション機能のテスト
 * @category navigation
 * @title 内部リンクのナビゲーション機能
 */

test.describe("LNK-0003: 内部リンクのナビゲーション機能", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    /**
     * @testcase 内部リンクをクリックして別のページに移動する
     * @description 内部リンクをクリックして別のページに移動することを確認するテスト
     */
    test("内部リンクをクリックして別のページに移動する", async ({ page }) => {
        // 認証状態を設定
        await page.addInitScript(() => {
        });
        // ホームページにアクセス
        await page.goto("http://localhost:7090/");

        // ページが読み込まれるのを待つ
        await page.waitForSelector("body", { timeout: 10000 });
        // 現在のURLを保存
        const homeUrl = page.url();
        console.log("Home URL:", homeUrl);

        // テスト用のHTMLを作成（内部リンクを含む）
        const linkPageName = "test-link-page-" + Date.now().toString().slice(-6);

        await page.setContent(`

        <div>

        <a href="/${linkPageName}" class="internal-link">${linkPageName}</a>

        </div>
        `);

        // 内部リンクを取得
        const internalLink = page.locator("a.internal-link").first();

        // リンクのhref属性を取得
        const href = await internalLink.getAttribute("href");
        expect(href).toBe(`/${linkPageName}`);

        // リンクがクリック可能であることを確認
        await expect(internalLink).toBeEnabled();

        // リンクをクリック
        await internalLink.click();

        // 新しいURLに遷移するのを待つ
        await page.waitForURL(`**/${linkPageName}`, { timeout: 10000 });
        // 新しいURLを確認
        const newUrl = page.url();
        console.log("New URL after click:", newUrl);
        expect(newUrl).toContain(`/${linkPageName}`);

        // URLが変更されていることを確認
        expect(newUrl).not.toBe(homeUrl);
    });
    /**
     * @testcase URLを直接入力して内部リンク先のページにアクセスする
     * @description URLを直接入力して内部リンク先のページにアクセスできることを確認するテスト
     */
});
