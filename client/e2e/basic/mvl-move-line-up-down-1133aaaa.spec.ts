import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Move line up/down", () => {
    test("should move line up and down with Alt+Arrow keys", async ({ page }, testInfo) => {
        const lines = ["Item 1", "Item 2", "Item 3"];
        await TestHelpers.prepareTestEnvironment(page, testInfo, lines);
        await TestHelpers.waitForOutlinerItems(page);

        const itemData = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll(".outliner-item[data-item-id]"));
            return items.map(el => ({
                id: el.getAttribute("data-item-id"),
                text: (el.querySelector(".item-text") as HTMLElement)?.textContent,
            }));
        });

        // If there are more items than expected, let's filter by text content to get our test items
        const targetItems = itemData.filter(i => lines.includes(i.text || ""));
        expect(targetItems.length).toBe(3);

        const id1 = targetItems.find(i => i.text === "Item 1")!.id!;
        const id2 = targetItems.find(i => i.text === "Item 2")!.id!;
        const id3 = targetItems.find(i => i.text === "Item 3")!.id!;

        // Set cursor on Item 2 (index 1 in the target list)
        // Note: we assume they are initially ordered as Item 1, Item 2, Item 3.
        // Let's verify initial order
        const initialOrder = itemData.map(i => i.id);
        const idx1 = initialOrder.indexOf(id1);
        const idx2 = initialOrder.indexOf(id2);
        const idx3 = initialOrder.indexOf(id3);

        expect(idx1).toBeLessThan(idx2);
        expect(idx2).toBeLessThan(idx3);

        await TestHelpers.setCursor(page, id2, 0);
        await TestHelpers.focusGlobalTextarea(page);

        // Move Item 2 UP (Alt+Up)
        await page.keyboard.press("Alt+ArrowUp");
        await page.waitForTimeout(500);

        // Verify order: Item 2 should be before Item 1
        const newOrder1 = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".outliner-item[data-item-id]"))
                .map(el => el.getAttribute("data-item-id"));
        });

        const newIdx1 = newOrder1.indexOf(id1);
        const newIdx2 = newOrder1.indexOf(id2);

        expect(newIdx2).toBeLessThan(newIdx1);

        // Move Item 2 DOWN (Alt+Down)
        await page.keyboard.press("Alt+ArrowDown");
        await page.waitForTimeout(500);

        const newOrder2 = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".outliner-item[data-item-id]"))
                .map(el => el.getAttribute("data-item-id"));
        });

        const newIdx1_2 = newOrder2.indexOf(id1);
        const newIdx2_2 = newOrder2.indexOf(id2);
        const newIdx3_2 = newOrder2.indexOf(id3);

        // Should be back to 1, 2, 3
        expect(newIdx1_2).toBeLessThan(newIdx2_2);
        expect(newIdx2_2).toBeLessThan(newIdx3_2);
    });
});
