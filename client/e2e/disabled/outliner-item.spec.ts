import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("OutlinerItem E2E", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // 認証状態をモック
        await page.addInitScript(() => {
        });
        await page.goto("/");
        // OutlinerItem がレンダリングされるのを待つ
        await page.waitForSelector(".outliner-item", { timeout: 10000 });
        // カーソル情報取得用のデバッグ関数をセットアップ
        await TestHelpers.setupCursorDebugger(page);
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

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // カーソルデータを取得して確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();
    });

    test("Alt+Clickでカーソルがstoreに追加される", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        // Alt+クリック
        await item.locator(".item-text").click({ modifiers: ["Alt"], force: true });
        // カーソル要素が追加されるのを待つ
        await page.waitForSelector(".editor-overlay .cursor", { timeout: 5000 });

        // カーソルデータを取得して確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
    });
});
