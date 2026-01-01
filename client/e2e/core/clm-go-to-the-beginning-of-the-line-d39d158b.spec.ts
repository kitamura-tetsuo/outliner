import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0007
 *  Title   : 行頭へ移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

// このテストは時間がかかるため、タイムアウトを増やす

test.describe("CLM-0007: 行頭へ移動", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["First line", "Second line", "Third line"]);
        await TestHelpers.waitForOutlinerItems(page, 30000, 3);
        // Ensure all seeded items are visible
        await page.locator(".outliner-item[data-item-id] >> nth=2").waitFor();

        // 2番目のアイテム（Second line）を取得してクリック
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId).not.toBeNull();
        const item = page.locator(`.outliner-item[data-item-id="${secondItemId}"] .item-content`);
        await item.click({ force: true });

        // グローバル textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus");

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // カーソルを少し右に移動させておく（Homeキーの効果を確認するため）
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

        // カーソルインスタンスが存在するまで待機
        await page.waitForFunction(() => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (!editorOverlayStore) return false;
            const cursorInstances = editorOverlayStore.getCursorInstances();
            return cursorInstances && cursorInstances.length > 0;
        }, { timeout: 10000 });

        // 少し待機してDOMが更新されるのを待つ
        await page.waitForTimeout(100);

        // エディタオーバーレイが表示されるまで待機
        await expect(page.locator(".editor-overlay")).toBeVisible({ timeout: 10000 });

        // カーソル要素が表示されるまで待機
        const cursorLocator = page.locator(".editor-overlay .cursor");
        await expect(cursorLocator.first()).toBeVisible({ timeout: 10000 });

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = cursorLocator.first();

        // カーソル情報取得を待機して初期状態を確認
        await page.waitForTimeout(300);
        const initialCursorData = await CursorValidator.getCursorData(page);
        console.log(`Initial cursor data:`, initialCursorData);
        expect(initialCursorData.cursorCount).toBeGreaterThan(0);

        // 初期カーソル位置を取得
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        console.log(`Initial cursor X position: ${initialX}`);

        // テキストエリアにフォーカスがあることを確認
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 5000 });

        // Homeキーを押下
        await page.keyboard.press("Home");
        // 更新を待機（カーソル移動がある程度遅れる可能性があるため）
        await page.waitForTimeout(800); // Wait a bit more for DOM update

        // 新しいカーソルオフセットを取得して確認
        const newCursorData = await CursorValidator.getCursorData(page);
        console.log(`New cursor data:`, newCursorData);

        // エディタオーバーレイのDOMが更新されるのを待機
        await expect(cursor).toBeVisible({ timeout: 10000 });

        // 新しいカーソル位置を取得
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        console.log(`New cursor X position: ${newX}`);

        // カーソルが左に移動していることを確認（DOM位置ではなく内部オフセットで確認）
        // Homeキーによりオフセットが0にリセットされていることを確認
        expect(newCursorData.cursors[0].offset).toBeLessThan(initialCursorData.cursors[0].offset);
        expect(newCursorData.cursors[0].offset).toBe(0); // Homeキーは行頭（オフセット0）に移動する

        // カーソルの位置が行の先頭にあることを確認（内部状態として）
        // Homeキーを押した後、オフセットが0になっていることを再確認
        const finalCursorData = await CursorValidator.getCursorData(page);
        expect(finalCursorData.cursors[0].offset).toBe(0);
        expect(finalCursorData.activeItemId).not.toBeNull();
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

        // カーソルインスタンスが存在するまで待機
        await page.waitForFunction(() => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (!editorOverlayStore) return false;
            const cursorInstances = editorOverlayStore.getCursorInstances();
            return cursorInstances && cursorInstances.length > 0;
        }, { timeout: 10000 });

        // 少し待機してDOMが更新されるのを待つ
        await page.waitForTimeout(100);

        // エディタオーバーレイが表示されるまで待機
        await expect(page.locator(".editor-overlay")).toBeVisible({ timeout: 10000 });

        // カーソル要素が表示されるまで待機
        const cursorLocator = page.locator(".editor-overlay .cursor");
        await expect(cursorLocator.first()).toBeVisible({ timeout: 10000 });

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = cursorLocator.first();

        // カーソル情報取得を待機して初期状態を確認
        await page.waitForTimeout(300);
        const initialCursorData = await CursorValidator.getCursorData(page);
        console.log(`Initial cursor data in second test:`, initialCursorData);
        expect(initialCursorData.cursorCount).toBeGreaterThan(0);

        // 初期カーソル位置を取得
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        console.log(`Initial cursor X position in second test: ${initialX}`);

        // テキストエリアにフォーカスがあることを確認
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 5000 });

        // Homeキーを押下
        await page.keyboard.press("Home");
        // 更新を待機（カーソル移動がある程度遅れる可能性があるため）
        await page.waitForTimeout(800); // Wait a bit more for DOM update

        // 新しいカーソルオフセットを取得して確認
        const newCursorData = await CursorValidator.getCursorData(page);
        console.log(`New cursor data in second test:`, newCursorData);

        // エディタオーバーレイのDOMが更新されるのを待機
        await expect(cursor).toBeVisible({ timeout: 10000 });

        // 新しいカーソル位置を取得
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        console.log(`New cursor X position in second test: ${newX}`);

        // カーソルが左に移動していることを確認（DOM位置ではなく内部オフセットで確認）
        // Homeキーによりオフセットが0にリセットされていることを確認
        expect(newCursorData.cursors[0].offset).toBeLessThan(initialCursorData.cursors[0].offset);
        expect(newCursorData.cursors[0].offset).toBe(0); // Homeキーは行頭（オフセット0）に移動する

        // カーソルの位置が行の先頭にあることを確認（内部状態として）
        // Homeキーを押した後、オフセットが0になっていることを再確認
        const finalCursorData = await CursorValidator.getCursorData(page);
        expect(finalCursorData.cursors[0].offset).toBe(0);
        expect(finalCursorData.activeItemId).not.toBeNull();
    });
});
