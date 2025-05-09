/** @feature SLR-0003
 *  Title   : 行末まで選択
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe("SLR-0003: 行末まで選択", () => {
    test.beforeEach(async ({ page }) => {
        // アプリを開く
        await page.goto("/");
        // OutlinerItem がレンダリングされるのを待つ
        await page.waitForSelector(".outliner-item");

        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        await page.waitForSelector("textarea.global-textarea:focus");

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // テスト用のテキストを入力（改行を明示的に入力）
        await page.keyboard.type("First line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line");

        // カーソルを2行目の先頭に移動
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Home");
    });

    test("Shift + Endで現在位置から行末までを選択する", async ({ page }) => {
        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // アクティブなアイテムを取得
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: 'visible' });

        // カーソルを行の途中に移動
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // 初期状態では選択範囲がないことを確認
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector('.editor-overlay .selection') !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // Shift + Endを押下
        await page.keyboard.down('Shift');
        await page.keyboard.press('End');
        await page.keyboard.up('Shift');

        // 更新を待機
        await page.waitForTimeout(100);

        // 選択範囲が作成されたことを確認
        const selectionExists = await page.evaluate(() => {
            return document.querySelector('.editor-overlay .selection') !== null;
        });
        expect(selectionExists).toBe(true);

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';
            return store.getSelectedText();
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);
    });

    test.skip("複数行のアイテムでは、現在のカーソルがある行の末尾までを選択する", async ({ page }) => {
        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // アクティブなアイテムを取得
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: 'visible' });

        // カーソルを3行目に移動し、行の途中に配置
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // 初期状態では選択範囲がないことを確認
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector('.editor-overlay .selection') !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // Shift + Endを押下
        await page.keyboard.down('Shift');
        await page.keyboard.press('End');
        await page.keyboard.up('Shift');

        // 更新を待機（十分な時間を確保）
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const selectionExists = await page.evaluate(() => {
            // 選択範囲が存在するかチェック
            const hasSelection = document.querySelector('.editor-overlay .selection') !== null;

            // 選択範囲が存在しない場合は、強制的に更新を試みる
            if (!hasSelection) {
                const store = (window as any).editorOverlayStore;
                if (store && typeof store.forceUpdate === 'function') {
                    store.forceUpdate();
                    console.log('Forced update of selection display');
                }
            }

            return document.querySelector('.editor-overlay .selection') !== null;
        });

        // 選択範囲が見つからない場合は、もう少し待ってから再確認
        if (!selectionExists) {
            await page.waitForTimeout(200);
            await page.evaluate(() => {
                const store = (window as any).editorOverlayStore;
                if (store && typeof store.forceUpdate === 'function') {
                    store.forceUpdate();
                }
            });
            await page.waitForTimeout(100);
        }

        // 最終確認
        const finalSelectionExists = await page.evaluate(() => {
            return document.querySelector('.editor-overlay .selection') !== null;
        });
        expect(finalSelectionExists).toBe(true);

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';
            return store.getSelectedText();
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);
    });
});
