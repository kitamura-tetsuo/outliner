import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

type CursorInstance = {
    isActive?: boolean;
    itemId?: string;
    offset?: number;
};

test.describe("CLM-6f0bdbc3: 一番上の行での上移動", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("一番上の行にある時は、一つ前のアイテムの最後の行へ移動する", async ({ page }) => {
        // 最初のアイテムをクリックしてカーソルを作成
        await page.locator(".outliner-item").first().click();
        await TestHelpers.waitForCursorVisible(page);

        // カーソルデータを取得して確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);

        // アクティブなアイテムのIDを取得
        const firstItemId = cursorData.activeItemId;
        expect(firstItemId).not.toBeNull();

        // 1つ目のアイテムに長いテキストが入力されていることを確認
        const firstItemText = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text")
            .textContent();
        console.log(`1つ目のアイテムのテキスト: "${firstItemText}"`);

        // 2つ目のアイテムを追加
        await page.keyboard.press("End"); // 最後に移動
        await page.keyboard.press("Enter");

        // 2つ目のアイテムにも長いテキストを入力
        await page.keyboard.type(
            "これは2つ目のアイテムです。このテキストも十分に長くして、複数行になるようにします。アイテムの幅に応じて自動的に折り返されて表示されるはずです。",
        );
        await TestHelpers.waitForCursorVisible(page);

        // 2つ目のアイテムの先頭に移動
        await page.keyboard.press("Home");

        // 2つ目のアイテムのカーソルデータを取得
        const secondItemCursorData = await CursorValidator.getCursorData(page);
        expect(secondItemCursorData.cursorCount).toBeGreaterThan(0);

        // 2つ目のアイテムのIDを取得
        const _secondItemId = secondItemCursorData.activeItemId;
        expect(_secondItemId).not.toBeNull();
        expect(_secondItemId).not.toBe(firstItemId);

        const secondCursorInstances: CursorInstance[] = (secondItemCursorData.cursorInstances as CursorInstance[])
            || [];
        const secondItemCursorInstance: any =
            (secondCursorInstances.find((c) => c?.isActive) ?? secondCursorInstances[0]) as CursorInstance | undefined;
        expect(secondItemCursorInstance?.itemId).toBe(_secondItemId);
        expect(secondItemCursorInstance?.offset).toBe(0);

        // 2つ目のアイテムのテキストを確認
        const _secondItemText = await page.locator(`.outliner-item[data-item-id="${_secondItemId}"]`).locator(
            ".item-text",
        ).textContent();
        console.log(`2つ目のアイテムのテキスト: "${_secondItemText}"`);

        // 上矢印キーを押下（2つ目のアイテムの先頭から1つ目のアイテムの最後の行へ移動するはず）
        await page.keyboard.press("ArrowUp");
        await TestHelpers.waitForCursorVisible(page);

        // 押下後にカーソルが1つ目のアイテムに移動するまで待機
        await page.waitForFunction(
            firstItemId => {
                const store = (window as any).editorOverlayStore;
                if (!store) return false;
                if (store.activeItemId !== firstItemId) return false;
                const cursors = Object.values(store.cursors || {});
                if (cursors.length === 0) return false;
                const activeCursor = cursors.find((c: any) => c.isActive) || cursors[0];
                return (activeCursor as any)?.itemId === firstItemId;
            },
            firstItemId,
            { timeout: 15000 },
        );

        // 押下後のカーソルデータを取得
        const afterKeyPressCursorData = await CursorValidator.getCursorData(page);
        const cursorInstances: CursorInstance[] = (afterKeyPressCursorData.cursorInstances as CursorInstance[]) || [];
        const activeItemIdAfterKeyPress = afterKeyPressCursorData.activeItemId;
        expect(activeItemIdAfterKeyPress).toBe(firstItemId);

        const activeCursorInstance: any = (cursorInstances.find((c) => c?.isActive) ?? cursorInstances[0]) as
            | CursorInstance
            | undefined;
        expect(activeCursorInstance?.itemId).toBe(firstItemId);

        // 2つ目のアイテムの先頭から上矢印を押したので、前のアイテムの最後の行の先頭に移動するはず
        expect(activeCursorInstance?.offset).toBe(0);
    });
});
