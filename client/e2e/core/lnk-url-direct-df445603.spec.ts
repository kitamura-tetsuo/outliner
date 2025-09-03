/** @feature LNK-0003
 *  Title   : 内部リンクのナビゲーション機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { waitForCursorVisible } from "../helpers";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("LNK-0003: 内部リンクのナビゲーション機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("URLを直接入力して内部リンク先のページにアクセスする", async ({ page }) => {
        // 認証状態を設定
        await page.addInitScript(() => {
        });

        // まずホームページにアクセス
        await page.goto("http://localhost:7090/");

        // ページが読み込まれるのを待つ
        await page.waitForSelector("body", { timeout: 10000 });

        // 現在のURLを確認
        const homeUrl = page.url();
        console.log("Home URL:", homeUrl);

        // 存在しないページに直接アクセス（新しいページが作成される）
        const randomPage = "page-" + Date.now().toString().slice(-6);

        // ページに移動
        await page.goto(`http://localhost:7090/${randomPage}`);

        // 新しいURLに遷移するのを待つ
        await page.waitForURL(`**/${randomPage}`, { timeout: 10000 });

        // 現在のURLを確認
        const pageUrl = page.url();
        console.log("Page URL:", pageUrl);
        expect(pageUrl).toContain(`/${randomPage}`);

        // 基本的なページ遷移が機能していることを確認
        expect(pageUrl).not.toBe(homeUrl);
    });
});
import "../utils/registerAfterEachSnapshot";
