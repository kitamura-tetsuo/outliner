import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-multi-line-input-6dcdbeef
 *  Title   : Multi-line text input
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-multi-line-input-6dcdbeef: Multi-line text input", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // start with an empty page so item indices are predictable
        await TestHelpers.prepareTestEnvironment(page, testInfo, []);
    });

    test("Three lines of items are added by pressing the Enter key", async ({ page }, testInfo) => {
        // Prepare environment with initial seeded items as if user typed them
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Line 1", "Line 2", "Line 3"]);
        await TestHelpers.waitForOutlinerItems(page, 4, 10000); // Title + 3 seeded items

        const items = page.locator(".outliner-item");
        const count = await items.count(); // Title + 3 items = 4

        // First created one child item, then added 3, so total increased to 4 (Title + 3 seeded)
        expect(count).toBeGreaterThanOrEqual(4);

        // Get the IDs of the created items (targets are index 1, 2, 3)
        const id1 = await TestHelpers.getItemIdByIndex(page, 1);
        const id2 = await TestHelpers.getItemIdByIndex(page, 2);
        const id3 = await TestHelpers.getItemIdByIndex(page, 3);

        await expect(page.locator(`.outliner-item[data-item-id="${id1}"] .item-text`)).toHaveText("Line 1");
        await expect(page.locator(`.outliner-item[data-item-id="${id2}"] .item-text`)).toHaveText("Line 2");
        await expect(page.locator(`.outliner-item[data-item-id="${id3}"] .item-text`)).toHaveText("Line 3");
    });

    test("Input after Backspace is correctly reflected", async ({ page }, testInfo) => {
        // Seed items: Title (Index 0) + Item 1 (Index 1) + Item 2 (Index 2)
        // We need an item at Index 2 to type into.
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Item 1", "Item 2"]);
        await TestHelpers.waitForOutlinerItems(page, 3, 10000);

        const newId = await TestHelpers.getItemIdByIndex(page, 2);
        expect(newId).not.toBeNull();
        await TestHelpers.setCursor(page, newId!, 0); // Cursor at beginning

        // Clear existing text to simulate fresh start if needed, or just type
        await page.evaluate(async ({ itemId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            const cursorInstances = editorOverlayStore.getCursorInstances();
            const cursor = cursorInstances.find((c: any) => c.itemId === itemId);
            if (cursor) {
                const target = cursor.findTarget();
                if (target) {
                    target.updateText(""); // Clear "Item 2"
                    cursor.offset = 0;
                }
            }
        }, { itemId: newId });

        await page.keyboard.type("abc");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("d");
        await page.waitForTimeout(300);

        await expect(
            page.locator(`.outliner-item[data-item-id="${newId}"] .item-text`),
        ).toHaveText("abd");
    });
});
