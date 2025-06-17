// File in disabled/ due to potential flakiness with generic selectors and interaction timing.
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
        await page.click(".outliner .toolbar .actions button");
        // アイテム数が増えていることを確認
        await expect(items).toHaveCount(initialCount + 1, { timeout: 7000 });
    });

    test("アイテムの作成、兄弟追加、削除が正しく機能する", async ({ page }) => {
        const items = page.locator(".outliner-item");
        const initialCount = await items.count();

        // 新規アイテムを追加 (ツールバーから)
        await page.click(".outliner .toolbar .actions button");
        await expect(items).toHaveCount(initialCount + 1, { timeout: 7000 });

        // 追加されたアイテム（インデックス1、 assuming initialCount was at least 1, so this is the second or newer item)
        // If initialCount could be 0, then nth(0) for first click, nth(1) for second item.
        // Let's assume initialCount >= 1 based on beforeEach.
        // The new item from toolbar usually appears last or based on current focus.
        // For robustness, let's operate on the newly added item, which should be items.nth(initialCount)
        const newItem = items.nth(initialCount); // This is the item added by toolbar

        // そのアイテムに対して兄弟追加
        // Hovering might be needed if buttons are not always visible
        await newItem.hover();
        await newItem.locator('button[title="新しいアイテムを追加"]').click();
        await expect(items).toHaveCount(initialCount + 2, { timeout: 7000 });

        // 追加された3番目のアイテム (which is now items.nth(initialCount + 1)) を削除
        const thirdItemOverall = items.nth(initialCount + 1);
        await thirdItemOverall.hover();
        await thirdItemOverall.locator('button[title="削除"]').click();
        await expect(items).toHaveCount(initialCount + 1, { timeout: 7000 });
    });
});
