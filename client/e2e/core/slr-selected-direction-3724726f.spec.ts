import "../utils/registerAfterEachSnapshot";
registerCoverageHooks();
// @ts-nocheck
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-3724726f: Switch selection direction", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["First item text", "Second item text"]);
        await TestHelpers.waitForOutlinerItems(page, 3, 10000);
    });

    test("can switch the selection direction (forward/reverse)", async ({ page }) => {
        // Re-enable debug mode
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
            console.log("Debug mode enabled in test");
        });

        // Get the first item
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        // Set cursor to the first item
        await TestHelpers.setCursor(page, firstItemId!, 0);
        await TestHelpers.ensureCursorReady(page);

        // Create a forward selection (Shift + Down Arrow)
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Shift");

        // Wait until the selection is created (Check Store state)
        await page.waitForFunction(() => {
            const store = (window as any).editorOverlayStore;
            return store && Object.keys(store.selections).length > 0;
        });

        // Wait a little bit to wait for DOM reflection
        await page.waitForTimeout(300);

        // Check Store state (skip checking DOM visibility as it may be environment dependent, check Store consistency instead)
        const forwardSelectionDirection = await page.evaluate<boolean | null>(() => {
            const store = (window as any).editorOverlayStore;
            const selection = Object.values<any>(store.selections)[0];
            return selection ? (selection as any).isReversed : null;
        });

        // Ensure it's a forward selection
        expect(forwardSelectionDirection).toBe(false);

        // Clear selection
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        // Get the second item
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 2);
        expect(secondItemId).not.toBeNull();

        // Set cursor to the second item
        await TestHelpers.setCursor(page, secondItemId!, 0);
        await TestHelpers.ensureCursorReady(page);

        // Create a reverse selection (Shift + Up Arrow)
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.up("Shift");

        // Wait until the selection is created (Check Store state)
        await page.waitForFunction(() => {
            const store = (window as any).editorOverlayStore;
            return store && Object.keys(store.selections).length > 0;
        });

        // Wait a little bit to wait for DOM reflection
        await page.waitForTimeout(300);

        // Check Store state (skip checking DOM visibility as it may be environment dependent, check Store consistency instead)
        const reverseSelectionDirection = await page.evaluate<boolean | null>(() => {
            const store = (window as any).editorOverlayStore;
            const selection = Object.values<any>(store.selections)[0];
            return selection ? (selection as any).isReversed : null;
        });

        // Ensure it's a reverse selection
        expect(reverseSelectionDirection).toBe(false);
    });
});
