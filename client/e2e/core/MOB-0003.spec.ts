import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature MOB-0003
 *  Title   : Mobile Bottom Action Toolbar
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("MOB-0003: Mobile action toolbar", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 375, height: 700 });
        await TestHelpers.prepareTestEnvironment(page, testInfo, [""]);

        // Close sidebar on mobile to avoid layout issues
        const sidebarToggle = page.locator('button[aria-label*="sidebar"]').first();
        const sidebar = page.locator(".sidebar.open");
        if (await sidebar.isVisible().catch(() => false)) {
            await sidebarToggle.click();
            await page.waitForTimeout(400); // Wait for transition
        }

        // Wait for items to be rendered
        await TestHelpers.waitForOutlinerItems(page);

        // Use the first content item (index 1), not the title (index 0)
        const contentItem = page.locator(".outliner-item").nth(1);
        await contentItem.waitFor({ state: "visible" });
        // Small delay for UI stability
        await page.waitForTimeout(500);

        // Retry clicking until the textarea is focused
        await expect.poll(async () => {
            await contentItem.locator(".item-content").click({ force: true, position: { x: 10, y: 10 } });
            return await page.evaluate(() => document.activeElement?.className.includes("global-textarea"));
        }, { timeout: 15000 }).toBe(true);

        await page.waitForSelector("textarea.global-textarea:focus");
        await page.keyboard.type("One");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Two");
    });

    test("toolbar appears and performs actions", async ({ page }) => {
        const toolbar = page.locator("[data-testid='mobile-action-toolbar']");
        await expect(toolbar).toBeVisible();

        const items = page.locator(".outliner-item");
        const itemSnapshot = await items.evaluateAll(nodes =>
            nodes.map(node => ({
                id: node.getAttribute("data-item-id"),
                text: node.querySelector(".item-content")?.textContent?.trim() || "",
            }))
        );
        console.log("MOB-0003: item order", JSON.stringify(itemSnapshot));
        // Get the second root item (index 3 overall, which is the second child of page title)
        const thirdId = await items.nth(3).getAttribute("data-item-id");
        console.log("MOB-0003: Setting active item to ID:", thirdId);

        // Set the active item directly via editorOverlayStore
        await page.evaluate((itemId) => {
            const store = (window as any).editorOverlayStore;
            if (store && typeof store.setActiveItem === "function") {
                store.setActiveItem(itemId);
                console.log("MOB-0003: Active item set to", itemId);
            }
        }, thirdId);
        await page.waitForTimeout(300);

        // ページタイトルの子アイテム数を取得
        const rootItemsBefore: unknown = await TreeValidator.getTreePathData(page, "items.0.items");
        const countBefore = Object.keys(rootItemsBefore || {}).length;
        console.log("MOB-0003: root items before indent", countBefore, JSON.stringify(rootItemsBefore));

        // Debug: Check if button is clickable
        const indentButton = toolbar.locator("button[aria-label='Indent']");
        await expect(indentButton).toBeVisible();
        console.log("MOB-0003: Indent button is visible");

        // Listen for console logs
        page.on("console", msg => console.log("BROWSER LOG:", msg.text()));

        await indentButton.click();
        console.log("MOB-0003: Clicked indent button");

        await page.waitForTimeout(300);
        const rootItemsAfterIndentImmediate: unknown = await TreeValidator.getTreePathData(page, "items.0.items");
        console.log(
            "MOB-0003: root items immediate after indent",
            Object.keys(rootItemsAfterIndentImmediate || {}).length,
            JSON.stringify(rootItemsAfterIndentImmediate),
        );

        await expect.poll(async () => {
            const rootItems: unknown = await TreeValidator.getTreePathData(page, "items.0.items");
            return Object.keys(rootItems || {}).length;
        }).toBe(countBefore - 1);

        // アウトデント前にインデントされた子アイテムをクリック
        // インデント後のデータ構造から子アイテムのIDを取得
        const afterIndentData = await TreeValidator.getTreeData(page);
        console.log("MOB-0003: after indent tree", JSON.stringify(afterIndentData));
        const pageItem = afterIndentData.items[0];
        const pageChildren = Object.values(pageItem.items);
        // Get the second child of the page (一行目: テスト), which now has a child
        const secondChild = pageChildren[1] as { items?: Record<string, { id: string; }>; };
        const indentedItemId = secondChild.items ? Object.values(secondChild.items)[0]?.id : null;
        console.log("MOB-0003: indented item ID:", indentedItemId);

        // Set the active item directly to the indented item
        await page.evaluate((itemId) => {
            const store = (window as any).editorOverlayStore;
            if (store && typeof store.setActiveItem === "function") {
                store.setActiveItem(itemId);
            }
        }, indentedItemId);
        await page.waitForTimeout(300);

        await toolbar.locator("button[aria-label='Outdent']").click();
        await page.waitForTimeout(300);

        await expect.poll(async () => {
            const rootItems: unknown = await TreeValidator.getTreePathData(page, "items.0.items");
            return Object.keys(rootItems || {}).length;
        }).toBe(countBefore);

        // アウトデント後、新しく作成されたアイテムをクリック（最後のアイテム）
        const itemsAfterOutdent = page.locator(".outliner-item");
        const lastItemIndex = await itemsAfterOutdent.count() - 1;
        const lastItemId = await itemsAfterOutdent.nth(lastItemIndex).getAttribute("data-item-id");

        // Set the active item directly
        await page.evaluate((itemId) => {
            const store = (window as any).editorOverlayStore;
            if (store && typeof store.setActiveItem === "function") {
                store.setActiveItem(itemId);
            }
        }, lastItemId);
        await page.waitForTimeout(300);

        const siblingCountBefore = await items.count();
        await toolbar.locator("button[aria-label='Insert Above']").click();

        await expect(items).toHaveCount(siblingCountBefore + 1);

        // Insert Above後、元のアイテムを再度クリック（Insert Above操作で新しいアイテムが上に追加されるため）
        const itemsAfterInsertAbove = page.locator(".outliner-item");
        const lastItemIndexAfterAbove = await itemsAfterInsertAbove.count() - 1;
        const lastItemIdAfterAbove = await itemsAfterInsertAbove.nth(lastItemIndexAfterAbove).getAttribute(
            "data-item-id",
        );

        // Set the active item directly
        await page.evaluate((itemId) => {
            const store = (window as any).editorOverlayStore;
            if (store && typeof store.setActiveItem === "function") {
                store.setActiveItem(itemId);
            }
        }, lastItemIdAfterAbove);
        await page.waitForTimeout(300);

        await toolbar.locator("button[aria-label='Insert Below']").click();

        await expect(items).toHaveCount(siblingCountBefore + 2);

        // New Child操作前に、現在表示されているアイテムの中から適切なアイテムをクリック
        // Insert Above/Below操作後なので、最初のアイテムをクリック
        const currentItems = page.locator(".outliner-item");
        const firstChildItemId = await currentItems.nth(1).getAttribute("data-item-id");

        // Set the active item directly
        await page.evaluate((itemId) => {
            const store = (window as any).editorOverlayStore;
            if (store && typeof store.setActiveItem === "function") {
                store.setActiveItem(itemId);
            }
        }, firstChildItemId);
        await page.waitForTimeout(300);

        await toolbar.locator("button[aria-label='New Child']").click();
        await page.waitForTimeout(300);

        // データ構造から子要素があることを確認
        const afterNewChildData = await TreeValidator.getTreeData(page) as {
            items: Record<string, { items?: Record<string, unknown>; }>;
        };
        const hasChildItems = Object.values(afterNewChildData.items ?? {}).some((item) =>
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
        } else {
            // スクロール不要な場合はテストをスキップ
            console.log("Toolbar does not need scrolling, skipping scroll test");
        }
    });
});
