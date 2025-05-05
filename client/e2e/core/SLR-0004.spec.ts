/** @feature SLR-0004
 *  Title   : マウスドラッグによる選択
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";

test.describe("SLR-0004: マウスドラッグによる選択", () => {
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

        // テスト用のテキストを入力
        await page.keyboard.type("This is a test text for mouse drag selection");
    });

    test("マウスドラッグで単一アイテム内のテキストを選択できる", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // テキスト要素を取得
        const textElement = activeItem.locator(".item-text");

        // テキスト要素の位置とサイズを取得
        const boundingBox = await textElement.boundingBox();
        expect(boundingBox).not.toBeNull();

        if (boundingBox) {
            // ドラッグの開始位置（テキストの先頭付近）
            const startX = boundingBox.x + 5;
            const startY = boundingBox.y + boundingBox.height / 2;

            // ドラッグの終了位置（テキストの中間付近）
            const endX = boundingBox.x + boundingBox.width / 2;
            const endY = boundingBox.y + boundingBox.height / 2;

            // マウスドラッグを実行
            await page.mouse.move(startX, startY);
            await page.mouse.down();
            await page.mouse.move(endX, endY, { steps: 10 }); // スムーズなドラッグのためにステップを追加
            await page.mouse.up();

            // 少し待機して選択が反映されるのを待つ
            await page.waitForTimeout(300);

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
        }
    });

    test("選択範囲が視覚的に表示される", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // テキスト要素を取得
        const textElement = activeItem.locator(".item-text");

        // テキスト要素の位置とサイズを取得
        const boundingBox = await textElement.boundingBox();
        expect(boundingBox).not.toBeNull();

        if (boundingBox) {
            // ドラッグの開始位置（テキストの先頭付近）
            const startX = boundingBox.x + 5;
            const startY = boundingBox.y + boundingBox.height / 2;

            // ドラッグの終了位置（テキストの中間付近）
            const endX = boundingBox.x + boundingBox.width / 2;
            const endY = boundingBox.y + boundingBox.height / 2;

            // マウスドラッグを実行
            await page.mouse.move(startX, startY);
            await page.mouse.down();
            await page.mouse.move(endX, endY, { steps: 10 });
            await page.mouse.up();

            // 少し待機して選択が反映されるのを待つ
            await page.waitForTimeout(300);

            // 選択範囲の要素が存在することを確認
            const selectionElement = page.locator('.editor-overlay .selection');
            await expect(selectionElement).toBeVisible();

            // 選択範囲の要素のスタイルを確認
            const backgroundColor = await selectionElement.evaluate(el => {
                return window.getComputedStyle(el).backgroundColor;
            });

            // 背景色が設定されていることを確認（rgba形式の値）
            expect(backgroundColor).toMatch(/rgba\(.*\)/);
        }
    });

    test("選択範囲のテキストをコピーできる", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // テキスト要素を取得
        const textElement = activeItem.locator(".item-text");

        // テキスト要素の位置とサイズを取得
        const boundingBox = await textElement.boundingBox();
        expect(boundingBox).not.toBeNull();

        if (boundingBox) {
            // ドラッグの開始位置（テキストの先頭付近）
            const startX = boundingBox.x + 5;
            const startY = boundingBox.y + boundingBox.height / 2;

            // ドラッグの終了位置（テキストの中間付近）
            const endX = boundingBox.x + boundingBox.width / 2;
            const endY = boundingBox.y + boundingBox.height / 2;

            // マウスドラッグを実行
            await page.mouse.move(startX, startY);
            await page.mouse.down();
            await page.mouse.move(endX, endY, { steps: 10 });
            await page.mouse.up();

            // 少し待機して選択が反映されるのを待つ
            await page.waitForTimeout(300);

            // 選択範囲の要素が存在することを確認
            const selectionExists = await page.evaluate(() => {
                return document.querySelector('.editor-overlay .selection') !== null;
            });
            expect(selectionExists).toBe(true);

            // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
            const selectedText = await page.evaluate(() => {
                const store = (window as any).editorOverlayStore;
                if (!store) return '';
                return store.getSelectedText();
            });

            // 選択範囲が存在することを確認
            expect(selectedText.length).toBeGreaterThan(0);

            // コピー操作を実行
            await page.keyboard.press('Control+c');

            // 新しいアイテムを追加
            await page.keyboard.press('Enter');

            // ペースト操作を実行
            await page.keyboard.press('Control+v');

            // 少し待機してペーストが反映されるのを待つ
            await page.waitForTimeout(300);

            // 新しいアイテムのテキストを取得
            const newItem = page.locator(".outliner-item").nth(1);
            const newItemText = await newItem.locator(".item-text").textContent();

            // ペーストされたテキストが空でないことを確認
            expect(newItemText?.length).toBeGreaterThan(0);

            // 選択範囲のテキストとペーストされたテキストの両方が存在することを確認
            expect(selectedText.length).toBeGreaterThan(0);
            expect(newItemText).not.toBeNull();
        }
    });
});
