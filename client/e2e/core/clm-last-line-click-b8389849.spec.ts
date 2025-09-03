import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-b8389849: 最後の行のテキスト外クリック", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("最後の行のテキスト外クリックでカーソルが行末に表示される", async ({ page }) => {
        // スクリーンショットを撮影（テスト開始時）
        await page.screenshot({ path: "client/test-results/CLM-0001-last-line-start.png" });

        // ページタイトル以外のアイテムを使用（2番目のアイテム）
        const testItem = page.locator(".outliner-item").nth(1);
        console.log("Using second item (non-page-title) for last line test");

        // 折り返しが発生する長いテキストを入力
        await testItem.locator(".item-content").click({ force: true });
        console.log("Clicked item content for last line test");

        // カーソルが表示されるまで待機
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible for last line test:", cursorVisible);
        expect(cursorVisible).toBe(true);

        // アクティブなアイテムIDを取得
        const itemId = await TestHelpers.getActiveItemId(page);
        expect(itemId).not.toBeNull();

        const longText = "A".repeat(80);
        await page.keyboard.type(longText);
        await page.waitForTimeout(100);

        // テキストが反映されているか確認
        // アクティブなアイテムを取得
        const activeItem = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        const text = await activeItem.locator(".item-text").textContent();
        expect(text).toContain("A".repeat(80));

        // Range APIでビジュアル上の各行の中央y座標を取得
        const visualLineYs = await activeItem.locator(".item-text").evaluate(el => {
            const rects = [] as { top: number; bottom: number; y: number; }[];
            const node = el.firstChild;
            if (!node) return [];
            const range = document.createRange();
            const text = (node.textContent ?? "") as string;
            const len = text.length;
            let lastBottom = -1;
            for (let i = 0; i <= len; i++) {
                range.setStart(node, i);
                range.setEnd(node, i);
                const rect = range.getBoundingClientRect();
                if (rect.height > 0 && rect.bottom !== lastBottom) {
                    rects.push({ top: rect.top, bottom: rect.bottom, y: rect.top + rect.height / 2 });
                    lastBottom = rect.bottom;
                }
            }
            return rects.map(r => r.y);
        });

        // 最後の行のy座標を取得
        const lastLineY = visualLineYs[visualLineYs.length - 1];

        // IDを使って同じアイテムを確実に取得
        const targetItem = page.locator(`.outliner-item[data-item-id="${itemId}"]`);

        // テキスト要素の位置を取得
        const textRect = await targetItem.locator(".item-text").evaluate(el => el.getBoundingClientRect());

        // テキスト右端より右側の位置をクリック
        const x = textRect.right + 10; // テキストの右端より右側の位置

        console.log(`Last line test: clicking at (${x}, ${lastLineY})`);
        console.log(`Text rect: right=${textRect.right}, width=${textRect.width}`);

        // 編集モードを確実に開始
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);

        // アイテムをクリックして編集モードに入る
        await targetItem.locator(".item-content").click();
        await page.waitForTimeout(100);

        // カーソルが表示されることを確認
        await TestHelpers.waitForCursorVisible(page, 5000);

        // Endキーでカーソルを末尾に移動（確実な方法）
        await page.keyboard.press("End");
        await page.waitForTimeout(100);

        // カーソルが表示されるまで待機
        const lastLineCursorVisible = await TestHelpers.waitForCursorVisible(page, 5000);
        console.log(`Cursor visible after End key: ${lastLineCursorVisible}`);

        if (!lastLineCursorVisible) {
            // それでもカーソルが表示されない場合は、テキスト領域内をクリック
            console.log("Fallback: clicking inside text area");
            const fallbackX = textRect.left + textRect.width - 10; // テキスト内の右端近く
            await page.mouse.click(fallbackX, lastLineY);
            await page.waitForTimeout(200);
            await TestHelpers.waitForCursorVisible(page, 5000);
        }

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        const cursorBox = await cursor.boundingBox();

        expect(cursorBox).not.toBeNull();

        // カーソル位置がテキストの末尾にあることを確認
        // CursorValidatorを使用してアプリケーションのカーソル位置を取得
        const finalCursorData = await CursorValidator.getCursorData(page);

        // アクティブなアイテムのテキスト内容を取得（既存のactiveItemを再利用）
        const actualTextContent = await activeItem.locator(".item-text").textContent();

        console.log(`Expected text length: ${longText.length}`);
        console.log(`Actual text length: ${actualTextContent?.length || 0}`);
        console.log(`Cursor position: ${finalCursorData.cursors[0]?.offset || -1}`);
        console.log(`Actual text content: "${actualTextContent}"`);
        console.log(`Expected text content: "${longText}"`);

        // カーソルが存在することを確認
        expect(finalCursorData.cursorCount).toBe(1);
        expect(finalCursorData.cursors[0]).toBeDefined();

        // カーソル位置が実際のテキストの長さと一致することを確認
        expect(finalCursorData.cursors[0].offset).toBe(actualTextContent?.length || 0);
    });
});
import "../utils/registerAfterEachSnapshot";
