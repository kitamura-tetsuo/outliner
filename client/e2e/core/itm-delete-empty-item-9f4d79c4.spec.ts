import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-0003
 *  Title   : Delete empty items with Delete key
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-0003: Delete empty item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1", ""]);
    });

    test("pressing Delete on empty item removes it", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        const items = page.locator(".outliner-item");
        const countBefore = await items.count();

        const thirdItem = items.nth(2); // "Title", "Item 1", "" -> index 2 is the empty item
        await thirdItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        await page.keyboard.press("Delete");
        await page.waitForTimeout(500);

        const countAfter = await items.count();
        expect(countAfter).toBe(countBefore - 1);
    });

    test("promotes an empty item's nested descendants at its sibling slot", async ({ page }) => {
        const seeded = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const before = items.at(0);
            const empty = items.at(1);
            const child1 = empty.items.addNode("e2e");
            child1.updateText("Child 1");
            const grandchild = child1.items.addNode("e2e");
            grandchild.updateText("Grandchild");
            const child2 = empty.items.addNode("e2e");
            child2.updateText("Child 2");
            return {
                before: before.id,
                empty: empty.id,
                child1: child1.id,
                child2: child2.id,
                grandchild: grandchild.id,
            };
        });

        await TestHelpers.setCursor(page, seeded.empty, 0);
        await TestHelpers.focusGlobalTextarea(page);
        await page.keyboard.press("Delete");

        const tree = await page.evaluate((expected) => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const promoted = [...items].find((item: any) => item.id === expected.child1);
            return {
                ids: [...items].map((item: any) => item.id),
                grandchildIds: [...promoted.items].map((item: any) => item.id),
            };
        }, seeded);
        expect(tree).toEqual({
            ids: [seeded.before, seeded.child1, seeded.child2],
            grandchildIds: [seeded.grandchild],
        });
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.activeItemId).toBe(seeded.child1);
        expect(cursorData.cursors).toHaveLength(1);
        expect(cursorData.cursors[0].offset).toBe(0);
    });
});
