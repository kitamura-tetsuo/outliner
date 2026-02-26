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

test.describe("CLM-6f0bdbc3: Move up at the top line", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("When on the top line, it moves to the last line of the previous item", async ({ page }) => {
        // Click the first item to create a cursor
        await page.locator(".outliner-item").first().click();
        await TestHelpers.waitForCursorVisible(page);

        // Get and verify cursor data
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);

        // Get the ID of the active item
        const firstItemId = cursorData.activeItemId;
        expect(firstItemId).not.toBeNull();

        // Confirm that long text is entered in the first item
        const firstItemText = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text")
            .textContent();
        console.log(`Text of the 1st item: "${firstItemText}"`);

        // Add a second item
        await page.keyboard.press("End"); // Move to the end
        await page.keyboard.press("Enter");

        // Enter long text into the second item as well
        await page.keyboard.type(
            "This is the second item. I will make this text long enough to span multiple lines. It should wrap automatically according to the item width.",
        );
        await TestHelpers.waitForCursorVisible(page);

        // Move to the beginning of the second item
        await page.keyboard.press("Home");

        // Get cursor data for the second item
        const secondItemCursorData = await CursorValidator.getCursorData(page);
        expect(secondItemCursorData.cursorCount).toBeGreaterThan(0);

        // Get the ID of the second item
        const secondItemId = secondItemCursorData.activeItemId;
        expect(secondItemId).not.toBeNull();
        expect(secondItemId).not.toBe(firstItemId);

        const secondCursorInstances: CursorInstance[] = (secondItemCursorData.cursorInstances as CursorInstance[])
            || [];
        const secondItemCursorInstance: any =
            (secondCursorInstances.find((c) => c?.isActive) ?? secondCursorInstances[0]) as CursorInstance | undefined;
        expect(secondItemCursorInstance?.itemId).toBe(secondItemId);
        expect(secondItemCursorInstance?.offset).toBe(0);

        // Check the text of the second item
        const secondItemText = await page.locator(`.outliner-item[data-item-id="${secondItemId}"]`).locator(
            ".item-text",
        ).textContent();
        console.log(`Text of the 2nd item: "${secondItemText}"`);

        // Press the Up Arrow key (should move from the beginning of the 2nd item to the last line of the 1st item)
        await page.keyboard.press("ArrowUp");
        await TestHelpers.waitForCursorVisible(page);

        // Wait until the cursor moves to the 1st item after pressing
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

        // Get cursor data after key press
        const afterKeyPressCursorData = await CursorValidator.getCursorData(page);
        const cursorInstances: CursorInstance[] = (afterKeyPressCursorData.cursorInstances as CursorInstance[]) || [];
        const activeItemIdAfterKeyPress = afterKeyPressCursorData.activeItemId;
        expect(activeItemIdAfterKeyPress).toBe(firstItemId);

        const activeCursorInstance: any = (cursorInstances.find((c) => c?.isActive) ?? cursorInstances[0]) as
            | CursorInstance
            | undefined;
        expect(activeCursorInstance?.itemId).toBe(firstItemId);

        // Since Up Arrow was pressed from the beginning of the 2nd item, it should move to the beginning of the last line of the previous item
        expect(activeCursorInstance?.offset).toBe(0);
    });
});
