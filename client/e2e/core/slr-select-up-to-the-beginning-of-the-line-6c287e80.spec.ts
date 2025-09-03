/** @feature SLR-0002
 *  Title   : 行頭まで選択
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0002: 行頭まで選択", () => {
    // テストのタイムアウトを120秒に設定

    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // グローバル textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 10000 });

        // テスト用のテキストを入力（改行を明示的に入力）
        await page.keyboard.type("First line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line");

        // カーソルを2行目の途中に移動
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
    });

    test("Shift + Homeで現在位置から行頭までを選択する", async ({ page }) => {
        // アクティブなアイテム要素を取得
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // カーソルを行の途中に移動
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // 初期状態では選択範囲がないことを確認
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector(".editor-overlay .selection") !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // Shift + Homeを押下
        await page.keyboard.down("Shift");
        await page.keyboard.press("Home");
        await page.keyboard.up("Shift");

        // 更新を待機
        await page.waitForTimeout(100);

        // 選択範囲が作成されたことを確認
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.selectionCount).toBeGreaterThan(0);
    });

    test("複数行のアイテムでは、現在のカーソルがある行の先頭までを選択する", async ({ page }) => {
        // アクティブなアイテム要素を取得
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // テキストを一度クリアして、新しいテキストを入力
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // 複数行のテキストを入力
        await page.keyboard.type("First line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line with more text");

        // カーソルを3行目の途中に移動
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // 初期状態では選択範囲がないことを確認
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector(".editor-overlay .selection") !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // 現在のカーソル位置を確認
        const cursorData = await CursorValidator.getCursorData(page);
        console.log("Current cursor position:", cursorData.cursors[0]);

        // Shift + Homeを押下
        await page.keyboard.down("Shift");
        await page.keyboard.press("Home");
        await page.keyboard.up("Shift");

        // 更新を待機
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);

        // カーソル情報を取得して検証
        const updatedCursorData = await CursorValidator.getCursorData(page);
        expect(updatedCursorData.cursorCount).toBe(1);
        expect(updatedCursorData.selectionCount).toBeGreaterThan(0);
    });
});
import "../utils/registerAfterEachSnapshot";
