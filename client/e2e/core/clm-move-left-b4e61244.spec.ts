import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0002
 *  Title   : 左へ移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
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
        } else {
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
        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // カーソル情報を取得して検証
        const initialCursorData = await CursorValidator.getCursorData(page);
        expect(initialCursorData.cursorCount).toBe(1);
        expect(initialCursorData.activeItemId).not.toBeNull();
        const initialOffset = initialCursorData.cursorInstances[0].offset;

        // 左矢印キーを押下
        await page.keyboard.press("ArrowLeft");
        // 更新を待機
        await page.waitForTimeout(100);

        // カーソル情報を再度取得して検証
        const updatedCursorData = await CursorValidator.getCursorData(page);
        expect(updatedCursorData.cursorCount).toBe(1);
        expect(updatedCursorData.activeItemId).not.toBeNull();
        const updatedOffset = updatedCursorData.cursorInstances[0].offset;

        // 左に移動していることを確認 - オフセットが1文字分小さくなっているはず
        expect(updatedOffset).toBe(initialOffset - 1);
    });

    test("一番最初の文字にある時は一つ前のアイテムの最後の文字へ移動する", async ({ page }) => {
        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // 最初のアイテムのIDを取得
        const itemId1 = await TestHelpers.getActiveItemId(page);
        expect(itemId1).not.toBeNull();

        // 2番目のアイテムの作成 (Enterで新しいアイテムを作成)
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");

        // 新しいアイテムに移動したことを確認
        await TestHelpers.waitForCursorVisible(page);
        const itemId2 = await TestHelpers.getActiveItemId(page);
        expect(itemId2).not.toBeNull();
        expect(itemId2).not.toBe(itemId1);

        // カーソルを行の先頭に移動
        await page.keyboard.press("Home");
        await page.waitForTimeout(100);

        // 左矢印キーを押下して前のアイテムに移動
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(500); // 十分な時間を待つ

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);

        // カーソルが最初のアイテムに移動したことを確認
        const newActiveItemId = await TestHelpers.getActiveItemId(page);
        expect(newActiveItemId).not.toBeNull();
        expect(newActiveItemId).toBe(itemId1);
    });
});
