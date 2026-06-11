/** @feature CLM-0002
 *  Title   : 左へ移動
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0002: 左へ移動", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        }
        else {
            await item.locator(".item-content").click({ force: true });
        }

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // 隠し textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus");
        // 文字入力が可能
        await page.keyboard.type("Test data update");
    });

    test("ArrowLeftキーでカーソルが1文字左に移動する", async ({ page }) => {
        // アクティブなアイテム要素を取得
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        await cursor.waitFor({ state: "visible" });

        // 初期カーソル位置を取得
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // 左矢印キーを押下
        await page.keyboard.press("ArrowLeft");
        // 更新を待機
        await page.waitForTimeout(100);

        // 新しいカーソル位置を取得
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        expect(newX).toBeLessThan(initialX);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
    });

    test("一番最初の文字にある時は、一つ前のアイテムの最後の文字へ移動する", async ({ page }) => {
        // 2つのアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // 2番目のアイテムのIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // カーソルを行の先頭に移動
        await page.keyboard.press("Home");
        await page.waitForTimeout(100);

        // 左矢印キーを押下して前のアイテムに移動
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(100);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);

        // 前のアイテムに移動したことを確認
        const newActiveItemId = await TestHelpers.getActiveItemId(page);
        expect(newActiveItemId).not.toBeNull();
        expect(newActiveItemId).not.toBe(activeItemId);

        // カーソルが前のアイテムの末尾にあることを確認
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        const cursorRect = await cursor.boundingBox();
        expect(cursorRect).not.toBeNull();

        // アクティブなアイテムのテキスト内容を確認
        const activeItem = page.locator(`.outliner-item[data-item-id="${newActiveItemId}"]`);
        const text = await activeItem.locator(".item-text").textContent();
        expect(text).toContain("Test data update");
    });
});
