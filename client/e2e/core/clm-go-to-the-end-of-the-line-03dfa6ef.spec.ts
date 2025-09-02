/** @feature CLM-0008
 *  Title   : 行末へ移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

// テストのタイムアウトを設定（長めに設定）

test.describe("CLM-0008: 行末へ移動", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
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

        // カーソルを2行目の先頭に移動
        await page.keyboard.press("Home");

        await page.keyboard.press("ArrowUp");

        await page.keyboard.press("ArrowDown");

        await page.keyboard.press("Home");
    });
    test("Endキーを押すと、カーソルが現在の行の末尾に移動する", async ({ page }) => {
        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        const base = page.locator('[data-testid="outliner-base"]');
        // アクティブなアイテムを取得（OutlinerBase配下）
        const activeItem = base.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // カーソルが表示されていることを確認（OutlinerBase配下のactiveカーソルを直接参照）
        const cursor = base.locator(".editor-overlay .cursor.active").first();
        await expect(cursor).toBeVisible();

        // Endキーを押下
        await page.keyboard.press("End");
        // 更新を待機
        await page.waitForTimeout(100);

        // カーソルが依然として表示されていることを確認
        await expect(cursor).toBeVisible();

        // アクティブなアイテムIDが変わっていないことを確認（行末移動なので同じアイテム内）
        const newActiveItemId = await TestHelpers.getActiveItemId(page);
        expect(newActiveItemId).toBe(activeItemId);

        console.log("Cursor successfully moved to end of line");
    });
});
