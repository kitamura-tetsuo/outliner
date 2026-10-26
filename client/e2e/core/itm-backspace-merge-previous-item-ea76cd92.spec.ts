import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-ea76cd92
 *  Title   : Merge with previous item using Backspace
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-ea76cd92: Backspace merge previous item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["First", "Second"]);
    });

    test("pressing Backspace at line start merges with previous item", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // Check item count
        const itemCount = await page.locator(".outliner-item").count();
        console.log(`Found ${itemCount} items`);

        // Actual test data are the 1st and 2nd items (0th is the page title)
        const firstId = await TestHelpers.getItemIdByIndex(page, 1); // "First"
        const secondId = await TestHelpers.getItemIdByIndex(page, 2); // "Second"
        expect(firstId).not.toBeNull();
        expect(secondId).not.toBeNull();

        console.log(`First item ID: ${firstId}, Second item ID: ${secondId}`);

        // Click the 2nd item ("Second") to enter edit mode
        await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-content`).click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Move cursor to the beginning of the line
        await page.keyboard.press("Home");
        await page.waitForTimeout(300);

        // Press Backspace to merge with the previous item
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(300);

        // Verify the active item is the first item ("First")
        const activeId = await TestHelpers.getActiveItemId(page);
        console.log(`Active item ID after merge: ${activeId}`);
        expect(activeId).toBe(firstId);

        // Verify the merged text
        const mergedText = await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`).textContent();
        console.log(`Merged text: "${mergedText}"`);
        expect(mergedText).toBe("FirstSecond");

        // Verify cursor position
        const cursorData = await CursorValidator.getCursorData(page);
        console.log(`Cursor data:`, cursorData);

        // Verify active item is correctly set
        expect(cursorData.activeItemId).toBe(firstId);

        // Verify cursor position
        expect(cursorData.cursors).toHaveLength(1);
        expect(cursorData.cursors[0].offset).toBe("First".length);
    });

    test("preserves nested descendant IDs and order after a real Backspace", async ({ page }) => {
        const seeded = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const first = items.at(0);
            const second = items.at(1);
            const child1 = second.items.addNode("e2e");
            child1.updateText("Child 1");
            const grandchild = child1.items.addNode("e2e");
            grandchild.updateText("Grandchild");
            const child2 = second.items.addNode("e2e");
            child2.updateText("Child 2");
            return {
                first: first.id,
                second: second.id,
                child1: child1.id,
                child2: child2.id,
                grandchild: grandchild.id,
            };
        });

        await TestHelpers.setCursor(page, seeded.second, 0);
        await TestHelpers.focusGlobalTextarea(page);
        await page.keyboard.press("Backspace");

        const tree = await page.evaluate((expected) => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const survivor = [...items].find((item: any) => item.id === expected.first);
            return {
                rootIds: [...items].map((item: any) => item.id),
                text: String(survivor.text),
                childIds: [...survivor.items].map((item: any) => item.id),
                grandchildIds: [...survivor.items.at(0).items].map((item: any) => item.id),
            };
        }, seeded);
        expect(tree).toEqual({
            rootIds: [seeded.first],
            text: "FirstSecond",
            childIds: [seeded.child1, seeded.child2],
            grandchildIds: [seeded.grandchild],
        });
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.activeItemId).toBe(seeded.first);
        expect(cursorData.cursors).toHaveLength(1);
        expect(cursorData.cursors[0].offset).toBe("First".length);
    });
});
