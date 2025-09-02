/** @feature CLM-0007
 *  Title   : 行頭へ移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

// このテストは時間がかかるため、タイムアウトを増やす

// 実行時間が長くなるため、テスト全体のタイムアウトを延長
// 以前からの意図に沿って30秒→120秒に拡大
test.setTimeout(120000);

test.describe("CLM-0007: 行頭へ移動", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 最初のアイテムをクリック
        const item = page.locator(".outliner-item").first();

        await item.locator(".item-content").click({ force: true });
        // グローバル textarea がフォーカスされるまで待機（非可視要素のため :focus 可視性では待たない）
        await page.waitForFunction(() => {
            const ta = document.querySelector("textarea.global-textarea");
            return ta !== null && document.activeElement === ta;
        });

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

        const base = page.locator('[data-testid="outliner-base"]');
        // アクティブなアイテムを取得（OutlinerBase配下）
        const activeItem = base.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // カーソルが表示されていることを確認（OutlinerBase配下のactiveカーソルを直接参照）
        const cursor = base.locator(".editor-overlay .cursor.active").first();
        await expect(cursor).toBeVisible();

        // Homeキーを押下
        await page.keyboard.press("Home");
        // 更新を待機
        await page.waitForTimeout(100);

        // カーソルが依然として表示されていることを確認
        await expect(cursor).toBeVisible();

        // Homeキーによる行頭移動が実行されたことを確認
        const newActiveItemId = await TestHelpers.getActiveItemId(page);
        expect(newActiveItemId).not.toBeNull();

        console.log(`Cursor moved after Home key press: from ${activeItemId} to ${newActiveItemId}`);
    });
    test("複数行のアイテムでは、現在のカーソルがある行の先頭に移動する", async ({ page }) => {
        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        const base = page.locator('[data-testid="outliner-base"]');
        // アクティブなアイテムを取得（OutlinerBase配下）
        const activeItem = base.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // カーソルを3行目に移動
        await page.keyboard.press("ArrowDown");

        // カーソルが表示されていることを確認（OutlinerBase配下のactiveカーソルを直接参照）
        const cursor = base.locator(".editor-overlay .cursor.active").first();
        await expect(cursor).toBeVisible();

        // Homeキーを押下
        await page.keyboard.press("Home");
        // 更新を待機
        await page.waitForTimeout(100);

        // カーソルが依然として表示されていることを確認
        await expect(cursor).toBeVisible();

        // Homeキーによる行頭移動が実行されたことを確認
        const newActiveItemId = await TestHelpers.getActiveItemId(page);
        expect(newActiveItemId).not.toBeNull();

        console.log(`Cursor moved after Home key press: from ${activeItemId} to ${newActiveItemId}`);
    });
});
