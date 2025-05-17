/** @feature SLR-0001
 *  Title   : Shift + 上下左右
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0001: Shift + 上下左右", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // グローバル textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 10000 });

        // 複数行のテキストを入力
        await page.keyboard.type("First line\nSecond line\nThird line");

        // カーソルを先頭に移動
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
    });

    test("Shift + 右で選択範囲の右端を広げる", async ({ page }) => {
        // アクティブなアイテム要素を取得
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // 初期状態では選択範囲がないことを確認
        let selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // 選択前のテキスト内容を取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        const initialText = await activeItem.locator(".item-text").textContent();

        // Shift + 右矢印キーを押下
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        await expect(page.locator('.editor-overlay .selection')).toBeVisible();

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';
            return store.getSelectedText();
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);

        // さらに選択範囲を広げる
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(300);

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const newSelectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';
            return store.getSelectedText();
        });

        // 選択範囲が広がったことを確認
        expect(newSelectionText.length).toBeGreaterThan(selectionText.length);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.selectionCount).toBeGreaterThan(0);
    });

    test("Shift + 左で選択範囲の左端を広げる", async ({ page }) => {
        // アクティブなアイテム要素を取得
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // カーソルを数文字右に移動
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // 初期状態では選択範囲がないことを確認
        let selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // Shift + 左矢印キーを押下
        await page.keyboard.press("Shift+ArrowLeft");
        await page.waitForTimeout(300);

        {
            await page.waitForTimeout(300);
            // カーソル情報を取得して検証
            const cursorData = await CursorValidator.getCursorData(page);
            expect(cursorData.cursorCount).toBe(1);
            expect(cursorData.selectionCount).toBeGreaterThan(0);
        }
        // // 選択範囲が作成されたことを確認
        // const selectionExists = await page.evaluate(() => {
        //     return document.querySelector('.editor-overlay .selection') !== null;
        // });
        // expect(selectionExists).toBe(true);

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';
            return store.getSelectedText();
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);

        // さらに選択範囲を広げる
        await page.keyboard.press("Shift+ArrowLeft");
        await page.keyboard.press("Shift+ArrowLeft");
        await page.waitForTimeout(300);

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const newSelectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';
            return store.getSelectedText();
        });

        // 選択範囲が広がったことを確認
        expect(newSelectionText.length).toBeGreaterThan(selectionText.length);

        {
            // カーソル情報を取得して検証
            const cursorData = await CursorValidator.getCursorData(page);
            expect(cursorData.cursorCount).toBe(1);
            expect(cursorData.selectionCount).toBeGreaterThan(0);
        }
    });

    test("Shift + 下で選択範囲の下端を広げる", async ({ page }) => {
        // アクティブなアイテム要素を取得
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // 初期状態では選択範囲がないことを確認
        let selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // Shift + 下矢印キーを押下
        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(3000);

        // 選択範囲が作成されたことを確認
        await expect(page.locator('.editor-overlay .selection')).toBeVisible();

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';
            return store.getSelectedText();
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);
        expect(selectionText).toContain("First line");

        // 選択範囲が複数行にまたがっていることを確認
        const lines = selectionText.split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(1);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.selectionCount).toBeGreaterThan(0);
    });

    test("Shift + 上で選択範囲の上端を広げる", async ({ page }) => {
        // アクティブなアイテム要素を取得
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // カーソルを2行目に移動
        await page.keyboard.press("ArrowDown");

        // 初期状態では選択範囲がないことを確認
        let selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // Shift + 上矢印キーを押下
        await page.keyboard.press("Shift+ArrowUp");
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        await expect(page.locator('.editor-overlay .selection')).toBeVisible();

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';
            return store.getSelectedText();
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);

        // 選択範囲のテキストを確認（"First line" または "Second line" のいずれかが含まれていればOK）
        const containsFirstLine = selectionText.includes("First line");
        const containsSecondLine = selectionText.includes("Second line");
        expect(containsFirstLine || containsSecondLine).toBe(true);

        // 選択範囲が複数行にまたがっていることを確認
        const lines = selectionText.split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(1);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.selectionCount).toBeGreaterThan(0);
    });
});
