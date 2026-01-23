import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Issue #1512: Shift + Right Arrow selection duplication", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 最初のアイテムを選択
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // グローバル textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 10000 });

        // テキストを入力
        await page.keyboard.type("Hello World");

        // カーソルを先頭に移動
        await page.keyboard.press("Home");
    });

    test("Shift + Right Arrow should not duplicate selection highlights", async ({ page }) => {
        // Shift + Right Arrow を複数回押す
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(100);
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(100);
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(100);

        // 選択範囲の DOM 要素 (.selection) の数をカウント
        const selectionCount = await page.locator(".editor-overlay .selection").count();

        // 重複していれば count は 1 より大きくなるはず (単一アイテム内の選択なら通常1つ)
        expect(selectionCount).toBe(1);

        // カーソルの DOM 要素 (.cursor) の数をカウント
        // カーソルIDでフィルタリングしないと、テスト用ダミーなどが含まれる可能性があるが、
        // active クラスがついている、もしくは単に .cursor の数をチェック
        // EditorOverlay renders all cursors in store.cursors
        const cursorCount = await page.locator(".editor-overlay .cursor").count();
        expect(cursorCount).toBe(1);
    });
});
