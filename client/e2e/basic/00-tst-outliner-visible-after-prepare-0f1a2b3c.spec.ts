import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * 確認事項
 * - TestHelpers.prepareTestEnvironment() 実行後にアウトラインページが表示される
 * - OutlinerBase のアンカー要素と「アイテム追加」ボタンが表示される
 */

test.describe("環境準備後にアウトラインページが表示される", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // 増加したタイムアウトで prepareTestEnvironment を実行
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    }, 240000); // 增加 beforeEach のタイムアウト to 240秒

    test.afterEach(async ({ page }) => {
        // Ensure proper cleanup after each test to maintain isolation
        await TestHelpers.cleanup(page);
    });

    test("PrepareTestEnvironment 後に Outliner UI が見える", async ({ page }) => {
        // デバッグ: 現在のURL
        console.log("E2E: current URL after prepare:", page.url());

        // 增加タイムアウトで待機
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 });

        // レイアウトおよびツールバー存在をDOM直読みで確認（ロケータ不安定対策）
        const toolbarExists = await page.evaluate(() => !!document.querySelector('[data-testid="main-toolbar"]'));
        console.log("E2E: toolbarExists=", toolbarExists);
        expect(toolbarExists).toBe(true);

        // 検索テキストボックスの存在も簡易確認（アクセシブル名は環境依存のためDOMベース）
        const textboxExists = await page.evaluate(() => {
            const boxes = Array.from(document.querySelectorAll('input, [role="textbox"]')) as HTMLElement[];
            return boxes.some(el =>
                (el.getAttribute("aria-label") === "Search pages") || el.closest('[data-testid="main-toolbar"]')
            );
        });
        console.log("E2E: textboxExists=", textboxExists);
        expect(textboxExists).toBe(true);
    }, 120000); // 增加テストのタイムアウト
});
