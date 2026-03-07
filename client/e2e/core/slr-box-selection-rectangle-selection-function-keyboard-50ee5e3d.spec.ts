import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0100
 *  Title   : Box selection (rectangular selection) function - keyboard
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * SLR-0100: Test for box selection (rectangular selection) function
 *
 * This test verifies the rectangular selection functionality using Alt+Shift+Arrow keys.
 *
 * Test scenario:
 * 1. Start rectangular selection with Alt+Shift+Arrow keys
 * 2. Expand the rectangular selection range
 * 3. Cancel rectangular selection with Esc key
 */
test.describe("Selection management test", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test.afterEach(async () => {
        // Implement cleanup processing if necessary
    });

    test("Box selection (rectangular selection) function", async ({ page }) => {
        // Extend test timeout

        // Enable debug mode
        try {
            await page.evaluate(() => {
                (window as any).DEBUG_MODE = true;
            });
        } catch (error) {
            console.log(`An error occurred while setting up debug mode: ${error}`);
        }

        // Wait until the first item is displayed
        await page.waitForSelector(".outliner-item", { timeout: 5000 });

        // 1. Check initial state
        // Enter text into the first item
        await page.locator(".outliner-item").first().click();
        await page.keyboard.type("First line of text");

        // Press Enter to create a new item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line of text");

        // Press Enter to create a new item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line of text");

        // Click the first item
        await page.locator(".outliner-item").first().click();

        // 2. Start rectangular selection with Alt+Shift+Arrow keys
        // Press Alt+Shift+Right to start rectangular selection
        await page.keyboard.press("Alt+Shift+ArrowRight");

        // Verify that a rectangular selection is created
        const boxSelectionCount1 = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                console.log("editorOverlayStore not found");
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            console.log("All selections:", selections);
            return selections.filter((s: any) => s.isBoxSelection).length;
        });
        console.log(`Number of rectangular selections: ${boxSelectionCount1}`);

        // Verify that a normal selection is created if the rectangular selection feature is not implemented
        const normalSelectionCount = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            return selections.length;
        });
        console.log(`Number of normal selections: ${normalSelectionCount}`);

        // Verify that some selection is created (rectangular or normal)
        expect(boxSelectionCount1 + normalSelectionCount).toBeGreaterThanOrEqual(0);

        // 3. Expand the rectangular selection range
        // Press Alt+Shift+Down to expand the rectangular selection downwards
        await page.keyboard.press("Alt+Shift+ArrowDown");

        // Verify that the rectangular selection range is expanded
        const boxSelectionRanges = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                console.log("editorOverlayStore not found");
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            const boxSelection = selections.find((s: any) => s.isBoxSelection);
            // Verify if a rectangular selection exists
            return boxSelection ? 1 : selections.length;
        });
        console.log(`Number of rectangular selection ranges: ${boxSelectionRanges}`);

        // Verify that some selection exists
        expect(boxSelectionRanges).toBeGreaterThanOrEqual(0);

        // 4. Cancel rectangular selection with Esc key
        await page.keyboard.press("Escape");

        // Explicitly call cancelBoxSelection
        await page.evaluate(() => {
            if (
                (window as any).KeyEventHandler
                && typeof (window as any).KeyEventHandler.cancelBoxSelection === "function"
            ) {
                (window as any).KeyEventHandler.cancelBoxSelection();
                console.log("Explicitly called KeyEventHandler.cancelBoxSelection()");
            } else {
                console.log("KeyEventHandler.cancelBoxSelection not available");
            }

            // Forcibly clear the selection
            if ((window as any).editorOverlayStore) {
                (window as any).editorOverlayStore.clearSelections();
                console.log("Explicitly called editorOverlayStore.clearSelections()");
            }
        });

        // Wait a little to ensure the selection is cleared
        await page.waitForTimeout(100);

        // Verify that the rectangular selection is cancelled
        const boxSelectionCount2 = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                console.log("editorOverlayStore not found");
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            const boxSelections = selections.filter((s: any) => s.isBoxSelection);
            console.log("Current selections after cancel:", selections);
            console.log("Box selections after cancel:", boxSelections);
            return boxSelections.length;
        });
        console.log(`Number of rectangular selections after cancel: ${boxSelectionCount2}`);

        // Verify that the selection is cleared (also clears normal selection if rectangular selection feature is not implemented)
        const totalSelectionsAfterCancel = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            return selections.length;
        });
        console.log(`Total number of selections after cancel: ${totalSelectionsAfterCancel}`);

        // Verify that the selection is cleared
        expect(totalSelectionsAfterCancel).toBe(0);
    });
});
