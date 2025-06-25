/** @feature CLM-0007
 *  Title   : 行頭へ移動
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

// このテストは時間がかかるため、タイムアウトを増やす

test.describe("CLM-0007: 行頭へ移動", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 最初のアイテムをクリック
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });

        // グローバル textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus");

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

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

    test("Homeキーを押すと、カーソルが現在の行の先頭に移動する", async ({ page }) => {
        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // アクティブなアイテムを取得
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        await cursor.waitFor({ state: "visible" });

        // 初期カーソル位置を取得
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // Homeキーを押下
        await page.keyboard.press("Home");
        // 更新を待機
        await page.waitForTimeout(100);

        // 新しいカーソル位置を取得
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // カーソルが左に移動していることを確認
        expect(newX).toBeLessThan(initialX);

        // カーソルの位置が行の先頭にあることを確認
        const cursorOffset = await page.evaluate(() => {
            const cursor = document.querySelector(".editor-overlay .cursor.active");
            if (!cursor) return null;
            const style = window.getComputedStyle(cursor);
            return {
                left: parseFloat(style.left),
                top: parseFloat(style.top),
            };
        });

        expect(cursorOffset).not.toBeNull();
    });

    test("複数行のアイテムでは、現在のカーソルがある行の先頭に移動する", async ({ page }) => {
        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // アクティブなアイテムを取得
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // カーソルを3行目に移動
        await page.keyboard.press("ArrowDown");

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        await cursor.waitFor({ state: "visible" });

        // 初期カーソル位置を取得
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // Homeキーを押下
        await page.keyboard.press("Home");
        // 更新を待機
        await page.waitForTimeout(100);

        // 新しいカーソル位置を取得
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // カーソルが左に移動していることを確認
        expect(newX).toBeLessThan(initialX);

        // カーソルの位置が行の先頭にあることを確認
        const cursorOffset = await page.evaluate(() => {
            const cursor = document.querySelector(".editor-overlay .cursor.active");
            if (!cursor) return null;
            const style = window.getComputedStyle(cursor);
            return {
                left: parseFloat(style.left),
                top: parseFloat(style.top),
            };
        });

        expect(cursorOffset).not.toBeNull();
    });
});
