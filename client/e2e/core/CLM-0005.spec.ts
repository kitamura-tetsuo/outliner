/** @feature CLM-0005
 *  Title   : 下へ移動
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";

test.describe("CLM-0005: 下へ移動", () => {
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

        // グローバル textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus");
        // 複数行のテキストを入力
        await page.keyboard.type("First line\nSecond line");
        // カーソルを1行目に移動
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
    });

    test("カーソルを1行下に移動する", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        await cursor.waitFor({ state: 'visible' });

        // 初期カーソル位置を取得
        const initialY = await cursor.evaluate(el => el.getBoundingClientRect().top);

        // 下矢印キーを押下
        await page.keyboard.press("ArrowDown");
        // 更新を待機
        await page.waitForTimeout(100);

        // 新しいカーソル位置を取得
        const newY = await cursor.evaluate(el => el.getBoundingClientRect().top);
        expect(newY).toBeGreaterThan(initialY);
    });

    test("一番下の行にある時は、一つ次のアイテムの最初の行へ移動する", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // アイテムのIDを取得して保存（後で同じアイテムを確実に特定するため）
        const firstItemId = await activeItem.evaluate(el => {
            const parent = el.closest('.outliner-item');
            return parent ? parent.getAttribute('data-item-id') : null;
        });

        // カーソルを2行目に移動
        await page.keyboard.press("ArrowDown");

        // 2つ目のアイテムを追加
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");

        // 1つ目のアイテムの最後の行に戻る
        await page.keyboard.press("Escape"); // 編集モードを一旦終了

        // IDを使って同じアイテムを確実に取得
        await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await page.keyboard.press("End"); // 最後に移動

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        await cursor.waitFor({ state: 'visible' });

        // 現在のアイテムのテキストを取得
        const initialItemText = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text").textContent();

        // 下矢印キーを押下
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(300);

        // 2つ目のアイテムを特定（テキスト内容で）
        const secondItem = page.locator(".outliner-item").filter({ hasText: "Second item" });
        await secondItem.waitFor({ state: 'visible' });

        // 2つ目のアイテムのIDを取得
        const secondItemId = await secondItem.evaluate(el => el.getAttribute('data-item-id'));

        // 新しいアイテムのテキストを取得
        const newItemText = await secondItem.locator(".item-text").textContent();

        // 異なるアイテムに移動していることを確認
        expect(initialItemText).not.toEqual(newItemText);
        expect(initialItemText).toContain("First line");
        expect(newItemText).toContain("Second item");

        // カーソルが次のアイテムにあることを確認
        const activeItemId = await page.evaluate(() => {
            const cursor = document.querySelector('.editor-overlay .cursor.active');
            if (!cursor) return null;

            // カーソルの位置から、それを含むアイテムを特定
            const cursorRect = cursor.getBoundingClientRect();
            const items = document.querySelectorAll('.outliner-item');

            for (const item of items) {
                const itemRect = item.getBoundingClientRect();
                // カーソルがアイテムの範囲内にあるかチェック
                if (
                    cursorRect.top >= itemRect.top &&
                    cursorRect.bottom <= itemRect.bottom
                ) {
                    return item.getAttribute('data-item-id');
                }
            }
            return null;
        });

        // カーソルが2つ目のアイテムにあることを確認
        expect(activeItemId).toBe(secondItemId);

        // カーソルが次のアイテムの最初の行付近にあることを確認
        const cursorY = await cursor.evaluate(el => el.getBoundingClientRect().top);
        const secondItemTop = await secondItem.locator(".item-content").evaluate(el => el.getBoundingClientRect().top);

        // カーソルY座標が2つ目のアイテムの範囲内にあることを確認
        const secondItemBottom = await secondItem.locator(".item-content").evaluate(el => {
            const rect = el.getBoundingClientRect();
            return rect.top + rect.height;
        });
        expect(cursorY).toBeGreaterThanOrEqual(secondItemTop);
        expect(cursorY).toBeLessThanOrEqual(secondItemBottom);
    });

    test("一番下の行にある時で、一つ次のアイテムがない時は、同じアイテムの末尾へ移動する", async ({ page }) => {
        // 最後のアイテムに移動
        await page.keyboard.press("Escape");

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

        // アイテムのIDを取得して保存
        const activeItem = page.locator(".outliner-item .item-content.editing");
        const itemId = await activeItem.evaluate(el => {
            const parent = el.closest('.outliner-item');
            return parent ? parent.getAttribute('data-item-id') : null;
        });

        // カーソルを行の途中に移動
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        await cursor.waitFor({ state: 'visible' });

        // 初期カーソル位置を取得
        const initialOffset = await cursor.evaluate(el => {
            // カーソルの位置を取得（データ属性などから）
            return parseInt(el.getAttribute('data-offset') || '-1');
        });

        // 下矢印キーを押下（次のアイテムがないので同じアイテムの末尾に移動するはず）
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(300);

        // 新しいカーソル位置を取得
        const newOffset = await cursor.evaluate(el => {
            // カーソルの位置を取得（データ属性などから）
            return parseInt(el.getAttribute('data-offset') || '-1');
        });

        // カーソルが右に移動していることを確認（末尾に移動したため）
        expect(newOffset).toBeGreaterThan(initialOffset);

        // カーソルが同じアイテム内にあることを確認
        const itemText = await page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text").textContent();
        expect(itemText).toContain("First line");
    });
});
