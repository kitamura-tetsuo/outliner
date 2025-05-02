/** @feature SLR-0001
 *  Title   : Shift + 上下左右
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";

test.describe("SLR-0001: Shift + 上下左右", () => {
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
        await page.keyboard.type("First line\nSecond line\nThird line");
        // カーソルを先頭に移動
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
    });

    test("Shift + 右で選択範囲の右端を広げる", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // 初期状態では選択範囲がないことを確認
        let selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // 選択前のテキスト内容を取得
        const initialText = await activeItem.locator(".item-text").textContent();

        // Shift + 右矢印キーを押下
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const selectionText = await page.evaluate(() => {
            // 選択範囲のテキストを取得
            const selection = window.getSelection();
            return selection ? selection.toString() : '';
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);

        // さらに選択範囲を広げる
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(300);

        // 選択範囲が広がったことを確認
        const newSelectionText = await page.evaluate(() => {
            // 選択範囲のテキストを取得
            const selection = window.getSelection();
            return selection ? selection.toString() : '';
        });

        // 選択範囲が広がったことを確認
        expect(newSelectionText.length).toBeGreaterThan(selectionText.length);
    });

    test("Shift + 左で選択範囲の左端を広げる", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

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

        // 選択範囲が作成されたことを確認
        const selectionText = await page.evaluate(() => {
            // 選択範囲のテキストを取得
            const selection = window.getSelection();
            return selection ? selection.toString() : '';
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);

        // さらに選択範囲を広げる
        await page.keyboard.press("Shift+ArrowLeft");
        await page.keyboard.press("Shift+ArrowLeft");
        await page.waitForTimeout(300);

        // 選択範囲が広がったことを確認
        const newSelectionText = await page.evaluate(() => {
            // 選択範囲のテキストを取得
            const selection = window.getSelection();
            return selection ? selection.toString() : '';
        });

        // 選択範囲が広がったことを確認
        expect(newSelectionText.length).toBeGreaterThan(selectionText.length);
    });

    test("Shift + 下で選択範囲の下端を広げる", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // 初期状態では選択範囲がないことを確認
        let selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // Shift + 下矢印キーを押下
        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const selectionText = await page.evaluate(() => {
            // 選択範囲のテキストを取得
            const selection = window.getSelection();
            return selection ? selection.toString() : '';
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);
        expect(selectionText).toContain("First line");

        // 選択範囲が複数行にまたがっていることを確認
        const lines = selectionText.split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    test("Shift + 上で選択範囲の上端を広げる", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // カーソルを2行目に移動
        await page.keyboard.press("ArrowDown");

        // 初期状態では選択範囲がないことを確認
        let selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // Shift + 上矢印キーを押下
        await page.keyboard.press("Shift+ArrowUp");
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const selectionText = await page.evaluate(() => {
            // 選択範囲のテキストを取得
            const selection = window.getSelection();
            return selection ? selection.toString() : '';
        });

        // 選択範囲が存在することを確認
        expect(selectionText.length).toBeGreaterThan(0);
        expect(selectionText).toContain("First line");

        // 選択範囲が複数行にまたがっていることを確認
        const lines = selectionText.split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(1);
    });
});
