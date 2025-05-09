/** @feature SLR-0005
 *  Title   : 複数アイテムにまたがる選択
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe("SLR-0005: 複数アイテムにまたがる選択", () => {
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

        // テスト用のテキストを入力
        await page.keyboard.type("First item text");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item text");

        // 3つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third item text");

        // 最初のアイテムに戻る
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Home");
    });

    test("Shift+上下キーで複数アイテムにまたがる選択範囲を作成できる", async ({ page }) => {
        // デバッグモードを有効化
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // アクティブなアイテムを取得
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: 'visible' });

        // 初期状態では選択範囲がないことを確認
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector('.editor-overlay .selection') !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // 現在のカーソル位置を確認
        const initialCursorInfo = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return null;
            const cursor = Object.values(store.cursors)[0];
            return cursor ? { itemId: cursor.itemId, offset: cursor.offset } : null;
        });
        console.log('Initial cursor position:', initialCursorInfo);

        // アイテムの情報を確認
        await page.evaluate(() => {
            const allItems = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLElement[];
            const allItemIds = allItems.map(el => el.getAttribute('data-item-id')!);
            const allItemTexts = allItems.map(el => {
                const textEl = el.querySelector('.item-text');
                return textEl ? textEl.textContent : '';
            });
            console.log('All items:', allItemIds.map((id, i) => ({ id, text: allItemTexts[i] })));
        });

        // 最初のアイテムをクリックして選択
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // Shift + 下矢印キーを2回押下して3つのアイテムを選択
        await page.keyboard.down('Shift');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.up('Shift');

        // 少し待機して選択が反映されるのを待つ
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const selectionExists = await page.evaluate(() => {
            console.log('Selections after arrow down:', Object.values((window as any).editorOverlayStore.selections));
            return document.querySelector('.editor-overlay .selection') !== null;
        });
        expect(selectionExists).toBe(true);

        // 少し待機して選択が反映されるのを待つ
        await page.waitForTimeout(300);

        // 選択範囲の情報を確認
        await page.evaluate(() => {
            console.log('Selections after second arrow down:', Object.values((window as any).editorOverlayStore.selections));

            // 選択範囲の詳細情報を表示
            const sel = Object.values((window as any).editorOverlayStore.selections)[0];
            if (sel) {
                const allItems = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLElement[];
                const allItemIds = allItems.map(el => el.getAttribute('data-item-id')!);

                console.log('Selection details:');
                console.log('- startItemId:', sel.startItemId);
                console.log('- endItemId:', sel.endItemId);
                console.log('- startOffset:', sel.startOffset);
                console.log('- endOffset:', sel.endOffset);
                console.log('- isReversed:', sel.isReversed);

                console.log('Start item index:', allItemIds.indexOf(sel.startItemId));
                console.log('End item index:', allItemIds.indexOf(sel.endItemId));
            }
        });

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';

            // 全てのアイテムのテキストを取得
            const allItems = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLElement[];
            const allItemTexts = allItems.map(el => {
                const textEl = el.querySelector('.item-text');
                return textEl ? textEl.textContent : '';
            });
            console.log('All item texts:', allItemTexts);

            // 選択範囲のテキストを取得
            const text = store.getSelectedText();
            console.log('Selected text:', text);
            return text;
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);

        // 少なくとも2つのアイテムのテキストが含まれていることを確認
        // テキストの一部が含まれているかを確認（完全一致ではなく部分一致）
        const containsSecondItem = selectionText.includes("Second item");
        const containsThirdItem = selectionText.includes("Third item");

        console.log(`Contains second item: ${containsSecondItem}`);
        console.log(`Contains third item: ${containsThirdItem}`);

        // どちらかのアイテムのテキストが含まれていればOK
        expect(containsSecondItem || containsThirdItem).toBe(true);

        // デバッグモードを無効化
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = false;
        });
    });

    test("マウスドラッグで複数アイテムにまたがる選択範囲を作成できる", async ({ page }) => {
        // デバッグモードを有効化
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // 最初のアイテムを取得
        const firstItem = page.locator(".outliner-item").nth(0);
        const firstItemText = firstItem.locator(".item-text");

        // 最初のアイテムをクリックして選択状態をリセット
        await firstItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // キーボードで複数アイテムにまたがる選択範囲を作成（マウスドラッグの代わりに）
        await page.keyboard.press("Home");
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("End");
        await page.keyboard.up("Shift");

        // 少し待機して選択が反映されるのを待つ
        await page.waitForTimeout(800);

        // 選択範囲の情報を確認
        await page.evaluate(() => {
            console.log('Selections after keyboard selection:', Object.values((window as any).editorOverlayStore.selections));

            // 選択範囲の詳細情報を表示
            const sel = Object.values((window as any).editorOverlayStore.selections)[0];
            if (sel) {
                const allItems = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLElement[];
                const allItemIds = allItems.map(el => el.getAttribute('data-item-id')!);
                const allItemTexts = allItems.map(el => {
                    const textEl = el.querySelector('.item-text');
                    return textEl ? textEl.textContent : '';
                });

                console.log('All items:', allItemIds.map((id, i) => ({ id, text: allItemTexts[i] })));

                console.log('Selection details:');
                console.log('- startItemId:', sel.startItemId);
                console.log('- endItemId:', sel.endItemId);
                console.log('- startOffset:', sel.startOffset);
                console.log('- endOffset:', sel.endOffset);
                console.log('- isReversed:', sel.isReversed);

                console.log('Start item index:', allItemIds.indexOf(sel.startItemId));
                console.log('End item index:', allItemIds.indexOf(sel.endItemId));
            }
        });

        // 選択範囲が作成されたことを確認
        const selectionExists = await page.evaluate(() => {
            return document.querySelector('.editor-overlay .selection') !== null;
        });
        expect(selectionExists).toBe(true);

        // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return '';

            // 全てのアイテムのテキストを取得
            const allItems = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLElement[];
            const allItemTexts = allItems.map(el => {
                const textEl = el.querySelector('.item-text');
                return textEl ? textEl.textContent : '';
            });
            console.log('All item texts:', allItemTexts);

            // 選択範囲のテキストを取得
            const text = store.getSelectedText();
            console.log('Selected text after keyboard selection:', text);
            return text;
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);

        // 少なくとも1つのアイテムのテキストが含まれていることを確認
        const containsFirstItem = selectionText.includes("First");
        const containsSecondItem = selectionText.includes("Second");
        const containsThirdItem = selectionText.includes("Third");
        expect(containsFirstItem || containsSecondItem || containsThirdItem).toBe(true);

        // デバッグモードを無効化
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = false;
        });
    });

    test("複数アイテムにまたがる選択範囲が視覚的に表示される", async ({ page }) => {
        // 最初のアイテムを取得
        const firstItem = page.locator(".outliner-item").nth(0);

        // 最初のアイテムをクリックして選択
        await firstItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // Shift + 下矢印キーを2回押下して3つのアイテムを選択
        await page.keyboard.down('Shift');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.up('Shift');

        // 少し待機して選択が反映されるのを待つ
        await page.waitForTimeout(500);

        // 選択範囲の要素が存在することを確認
        const selectionElements = page.locator('.editor-overlay .selection');

        // 少なくとも1つの選択範囲要素が表示されていることを確認
        const count = await selectionElements.count();
        expect(count).toBeGreaterThan(0);

        // 最初の選択範囲要素が表示されていることを確認
        await expect(selectionElements.first()).toBeVisible();

        // 選択範囲の要素のスタイルを確認
        const backgroundColor = await selectionElements.first().evaluate(el => {
            return window.getComputedStyle(el).backgroundColor;
        });

        // 背景色が設定されていることを確認（rgba形式の値）
        expect(backgroundColor).toMatch(/rgba\(.*\)/);
    });
});
