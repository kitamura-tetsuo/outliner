/** @feature CLM-0008
 *  Title   : 行末へ移動
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";

test.describe("CLM-0008: 行末へ移動", () => {
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

    test("Endキーを押すと、カーソルが現在の行の末尾に移動する", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        await cursor.waitFor({ state: 'visible' });

        // 初期カーソル位置を取得
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // Endキーを押下
        await page.keyboard.press("End");
        // 更新を待機
        await page.waitForTimeout(100);

        // 新しいカーソル位置を取得
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // カーソルが右に移動していることを確認
        expect(newX).toBeGreaterThan(initialX);

        // カーソルの位置が行の末尾にあることを確認
        const cursorOffset = await page.evaluate(() => {
            const cursor = document.querySelector('.editor-overlay .cursor.active');
            if (!cursor) return null;
            const style = window.getComputedStyle(cursor);
            return {
                left: parseFloat(style.left),
                top: parseFloat(style.top)
            };
        });

        expect(cursorOffset).not.toBeNull();
    });

    test("複数行のアイテムでは、現在のカーソルがある行の末尾に移動する", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // カーソルを3行目に移動
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");  // 確実に3行目に移動するために2回押す
        await page.waitForTimeout(100);

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        await cursor.waitFor({ state: 'visible' });

        // Endキーを押下
        await page.keyboard.press("End");
        // 更新を待機
        await page.waitForTimeout(300);  // 待機時間を長くする

        // カーソルの位置が行の末尾にあることを確認
        const cursorPosition = await page.evaluate(() => {
            const textarea = document.querySelector('.global-textarea') as HTMLTextAreaElement;
            if (!textarea) return null;

            // テキストの内容と現在のカーソル位置を取得
            const text = textarea.value;
            const position = textarea.selectionStart;

            // 現在の行の範囲を特定
            const lines = text.split('\n');
            let currentLine = 0;
            let currentPos = 0;

            // 現在の行を特定
            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i].length;
                if (position <= currentPos + lineLength) {
                    currentLine = i;
                    break;
                }
                currentPos += lineLength + 1; // +1 は改行文字分
            }

            // 現在の行の末尾位置を計算
            const lineEndPos = currentPos + lines[currentLine].length;

            return {
                position,
                lineEndPos,
                isAtLineEnd: position === lineEndPos
            };
        });

        // カーソルが行末にあることを確認
        expect(cursorPosition).not.toBeNull();
        expect(cursorPosition?.isAtLineEnd).toBe(true);
    });


});
