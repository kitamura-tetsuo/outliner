import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0004
 *  Title   : Move up
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0004: Move up", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("一番上の行にある時で、一つ前のアイテムがない時は、同じアイテムの先頭へ移動する", async ({ page }) => {
        await page.keyboard.press("Escape");

        // 最初のアイテム（ページタイトルまたは最初のアイテム）を特定
        const itemLocator = page.locator(".outliner-item.page-title");
        let firstItem;
        if ((await itemLocator.count()) === 0) {
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            firstItem = visibleItems.first();
        } else {
            firstItem = itemLocator;
        }
        const itemId = await firstItem.getAttribute("data-item-id");
        expect(itemId).toBeTruthy();

        // カーソルをアイテムの途中に設定
        const _initialItemText = (await firstItem.locator(".item-text").textContent()) || "";
        await TestHelpers.setCursor(page, itemId!, Math.floor(_initialItemText.length / 2));

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // 現在のカーソルデータを取得
        const beforeKeyPressCursorData = await CursorValidator.getCursorData(page);
        const itemIdBefore = beforeKeyPressCursorData.activeItemId;

        // アクティブなカーソルインスタンスからオフセットを取得
        const activeCursorBefore = beforeKeyPressCursorData.cursorInstances.find((c: any) => c.isActive);
        const offsetBefore = activeCursorBefore ? activeCursorBefore.offset : 0;

        console.log(`ArrowUp前: itemId=${itemIdBefore}, offset=${offsetBefore}`);

        // 上矢印キーを押下
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(300);

        // 押下後のカーソルデータを取得
        const afterKeyPressCursorData = await CursorValidator.getCursorData(page);
        const activeItemIdAfterKeyPress = afterKeyPressCursorData.activeItemId;

        // アクティブなカーソルインスタンスからオフセットを取得
        const activeCursorAfter = afterKeyPressCursorData.cursorInstances.find((c: any) => c.isActive);
        const offsetAfter = activeCursorAfter ? activeCursorAfter.offset : 0;

        console.log(`ArrowUp後: itemId=${activeItemIdAfterKeyPress}, offset=${offsetAfter}`);

        // 同じアイテムにいることを確認
        expect(activeItemIdAfterKeyPress).toBe(itemIdBefore);

        // 前のアイテムがない場合は、同じアイテムの先頭（offset=0）に移動することを確認
        expect(offsetAfter).toBe(0);

        // アイテムのテキストを確認
        const itemText = await page.locator(`.outliner-item[data-item-id="${activeItemIdAfterKeyPress}"]`).locator(
            ".item-text",
        )
            .textContent();
        expect(itemText).toBeTruthy(); // テキストが存在することを確認
    });
});
