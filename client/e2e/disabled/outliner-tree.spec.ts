import {
    expect,
    test,
} from "@playwright/test";

test.describe("OutlinerTree E2E", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // 認証状態を設定
        await page.addInitScript(() => {

        });
        await page.goto("/");
        // Outliner がレンダリングされるのを待つ
        await page.waitForSelector(".outliner", { timeout: 10000 });
    });

    test("ツールバーのアイテム追加ボタンで新規アイテムが追加される", async ({ page }) => {
        const items = page.locator(".outliner-item");
        const initialCount = await items.count();
        expect(initialCount).toBeGreaterThan(0);

        // ツールバーのアイテム追加を実行
        await page.click(".outliner .toolbar .actions button", { force: true });
        // アイテム数が増えていることを確認
        await expect(items).toHaveCount(initialCount + 1);
    });

    test("アイテムの作成、兄弟追加、削除が正しく機能する", async ({ page }) => {
        const items = page.locator(".outliner-item");
        const initialCount = await items.count();

        // 新規アイテムを追加
        await page.click(".outliner .toolbar .actions button", { force: true });
        await expect(items).toHaveCount(initialCount + 1);

        // 追加されたアイテム（2番目）に対して兄弟追加
        const secondItem = items.nth(1);
        await secondItem
            .locator('button[title="新しいアイテムを追加"]')
            .click({ force: true });
        await expect(items).toHaveCount(initialCount + 2);

        // 追加された3番目のアイテムを削除
        const thirdItem = items.nth(2);
        await thirdItem.locator('button[title="削除"]').click({ force: true });
        await expect(items).toHaveCount(initialCount + 1);
    });
});
