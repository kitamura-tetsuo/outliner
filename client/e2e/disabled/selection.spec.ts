// @ts-nocheck
import {
    expect,
    test,
} from "@playwright/test";

test.describe("アウトライナー E2E テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // 認証状態を設定
        await page.addInitScript(() => {

        });
        // アプリを開く
        await page.goto("/");
        // ページ作成フォームが表示されるのを待つ
        await page.waitForSelector(".page-create input");
        // テスト用ページを作成してリスト表示を待つ
        await page.fill(".page-create input", "テストページ");
        await page.click(".page-create button");
        await page.waitForSelector(".page-list li");
        // 最初のページを選択してアウトライナーを表示
        await page.click(".page-list li");
        await page.waitForSelector(".outliner-item");
    });

    test("編集モード時にカーソルが表示される", async ({ page }) => {
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.click();
        await page.keyboard.type("X");
        const cursor = page.locator(".cursor.active");
        await expect(cursor).toBeVisible();
    });

    test("Shift+ArrowDown で複数アイテムに選択ハイライトが描画される", async ({ page }) => {
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.click();
        await page.keyboard.press("Shift+ArrowDown");
        const selections = page.locator(".selection");
        await expect(selections).toHaveCount(2);
    });

    test("コピー操作時に隠し textarea に選択テキストが格納される", async ({ page }) => {
        const firstItem = page.locator(".outliner-item").first();
        const secondItem = page.locator(".outliner-item").nth(1);
        await firstItem.click();
        await page.keyboard.type("foo");
        await page.keyboard.press("Enter");
        await secondItem.click();
        await page.keyboard.type("bar");

        await firstItem.click();
        await page.keyboard.press("Shift+ArrowDown");

        await page.dispatchEvent("body", "copy");
        const clipVal = await page.locator(".clipboard-textarea").evaluate(e => (e as HTMLTextAreaElement).value);
        expect(clipVal).toContain("foo");
        expect(clipVal).toContain("bar");
    });
});
