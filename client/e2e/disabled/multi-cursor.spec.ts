import {
    expect,
    test,
} from "@playwright/test";

test.describe("マルチカーソル E2E テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // 認証状態を設定
        await page.addInitScript(() => {

        });
        await page.goto("/");
        // アウトライナーアイテムが表示されるのを待機
        await page.waitForSelector(".outliner-item", { timeout: 10000 });
    });

    test("Alt+Clickで複数カーソルを追加できる", async ({ page }) => {
        const items = page.locator(".outliner-item");
        // アイテムが2つ以上あるか確認し、なければ追加
        let count = await items.count();
        if (count < 2) {
            await page.click(".outliner .toolbar .actions button", { force: true });
            // 新しいアイテムが追加されるまで待機
            await page.waitForTimeout(500);
        }

        // 1番目のアイテムにAlt+Click
        await items.first().locator(".item-text").click({ modifiers: ["Alt"], force: true });
        // カーソル要素が1つ表示される
        await page.waitForSelector(".editor-overlay .cursor", { timeout: 5000 });
        let cursors = page.locator(".editor-overlay .cursor");
        expect(await cursors.count()).toBe(1);

        // 2番目のアイテムにAlt+Click
        await items.nth(1).locator(".item-text").click({ modifiers: ["Alt"], force: true });
        expect(await cursors.count()).toBe(2);

        // 再度1番目にAlt+Clickしても重複しない
        await items.first().locator(".item-text").click({ modifiers: ["Alt"], force: true });
        expect(await cursors.count()).toBe(2);
    });
});
