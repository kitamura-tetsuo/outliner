import {
    expect,
    test,
} from "@playwright/test";

test.describe("OutlinerItem E2E", () => {
    test.beforeEach(async ({ page }) => {
        // 認証状態をモック
        await page.addInitScript(() => {
            window.localStorage.setItem("authenticated", "true");
        });
        await page.goto("/");
        // OutlinerItem がレンダリングされるのを待つ
        await page.waitForSelector(".outliner-item", { timeout: 10000 });
    });

    test("非Altクリックで編集モードに入る", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        // 非Altクリック
        await item.locator(".item-text").click({ force: true });
        // 隠し textarea がフォーカスされているか確認
        const isFocused = await page.evaluate(() => {
            const active = document.activeElement;
            return active?.classList.contains("global-textarea");
        });
        expect(isFocused).toBe(true);
        // 編集クラスが付与されているか確認
        const hasEditing = await item.locator(".item-content").evaluate(el => el.classList.contains("editing"));
        expect(hasEditing).toBe(true);
    });

    test("Alt+Clickでカーソルがstoreに追加される", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        // Alt+クリック
        await item.locator(".item-text").click({ modifiers: ["Alt"], force: true });
        // カーソル要素が追加されるのを待つ
        await page.waitForSelector(".editor-overlay .cursor", { timeout: 5000 });
        const count = await page.locator(".editor-overlay .cursor").count();
        expect(count).toBeGreaterThan(0);
    });
});
