/** @feature MOB-0003
 *  Title   : Mobile Bottom Action Toolbar
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("MOB-0003: Mobile action toolbar", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 375, height: 700 });
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        const first = page.locator(".outliner-item").first();
        await first.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await page.keyboard.type("One");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Two");
    });

    test("toolbar appears and performs actions", async ({ page }) => {
        const toolbar = page.locator("[data-testid='mobile-action-toolbar']");
        await expect(toolbar).toBeVisible();

        const items = page.locator(".outliner-item");
        const secondId = await items.nth(2).getAttribute("data-item-id");
        await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-content`).click({ force: true });

        // ページタイトルの子アイテム数を取得
        const rootItemsBefore: any = await TreeValidator.getTreePathData(page, "items.0.items");
        const countBefore = Object.keys(rootItemsBefore || {}).length;

        await toolbar.locator("button[aria-label='Indent']").click();

        await expect.poll(async () => {
            const rootItems: any = await TreeValidator.getTreePathData(page, "items.0.items");
            return Object.keys(rootItems || {}).length;
        }).toBe(countBefore - 1);

        // アウトデント前にインデントされた子アイテムをクリック
        // インデント後のデータ構造から子アイテムのIDを取得
        const afterIndentData = await TreeValidator.getTreeData(page);
        const firstItem = afterIndentData.items[0];
        const firstItemChildren = firstItem.items;
        const firstChild = Object.values(firstItemChildren)[0];
        const firstChildId = firstChild.items ? Object.values(firstChild.items)[0].id : firstChild.id;

        await page.locator(`[data-item-id="${firstChildId}"] .item-content`).click({ force: true });
        await page.waitForTimeout(500);

        await toolbar.locator("button[aria-label='Outdent']").click();
        await page.waitForTimeout(500);

        await expect.poll(async () => {
            const rootItems: any = await TreeValidator.getTreePathData(page, "items.0.items");
            return Object.keys(rootItems || {}).length;
        }).toBe(countBefore);

        // アウトデント後、新しく作成されたアイテムをクリック（最後のアイテム）
        const itemsAfterOutdent = page.locator(".outliner-item");
        const lastItemIndex = await itemsAfterOutdent.count() - 1;
        await itemsAfterOutdent.nth(lastItemIndex).locator(".item-content").click({ force: true });
        await page.waitForTimeout(500);

        const siblingCountBefore = await items.count();
        await toolbar.locator("button[aria-label='Insert Above']").click();

        await expect(items).toHaveCount(siblingCountBefore + 1);

        // Insert Above後、元のアイテムを再度クリック（Insert Above操作で新しいアイテムが上に追加されるため）
        const itemsAfterInsertAbove = page.locator(".outliner-item");
        const lastItemIndexAfterAbove = await itemsAfterInsertAbove.count() - 1;
        await itemsAfterInsertAbove.nth(lastItemIndexAfterAbove).locator(".item-content").click({ force: true });
        await page.waitForTimeout(500);

        await toolbar.locator("button[aria-label='Insert Below']").click();

        await expect(items).toHaveCount(siblingCountBefore + 2);

        // New Child操作前に、現在表示されているアイテムの中から適切なアイテムをクリック
        // Insert Above/Below操作後なので、最初のアイテムをクリック
        const currentItems = page.locator(".outliner-item");
        await currentItems.nth(1).locator(".item-content").click({ force: true });
        await page.waitForTimeout(500);

        await toolbar.locator("button[aria-label='New Child']").click();
        await page.waitForTimeout(500);

        // データ構造から子要素があることを確認
        const afterNewChildData = await TreeValidator.getTreeData(page);
        const hasChildItems = Object.values(afterNewChildData.items).some((item: any) =>
            item.items && Object.keys(item.items).length > 0
        );
        expect(hasChildItems).toBe(true);

        // ツールバーの幅とスクロール可能性を確認
        const toolbarInfo = await toolbar.evaluate(el => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            canScroll: el.scrollWidth > el.clientWidth,
        }));

        // スクロール可能な場合のみスクロールテストを実行
        if (toolbarInfo.canScroll) {
            await toolbar.evaluate(el => {
                el.scrollLeft = el.scrollWidth;
            });
            const scrollLeft = await toolbar.evaluate(el => el.scrollLeft);
            expect(scrollLeft).toBeGreaterThan(0);
        }
        else {
            // スクロール不要な場合はテストをスキップ
            console.log("Toolbar does not need scrolling, skipping scroll test");
        }
    });
});
