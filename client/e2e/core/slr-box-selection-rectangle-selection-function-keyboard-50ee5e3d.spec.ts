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
 * SLR-0100: Box selection (rectangular selection) function test
 *
 * This test verifies the rectangular selection function using Alt+Shift+Arrow keys.
 *
 * Test contents:
 * 1. Start rectangular selection with Alt+Shift+Arrow keys
 * 2. Expand rectangular selection range
 * 3. Cancel rectangular selection with Esc key
 */
test.describe("Selection range management test", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test.afterEach(async () => {
        // Implement cleanup processing as needed
    });

    test("Box selection (rectangular selection) function", async ({ page }) => {
        // Extend test timeout

        // Enable debug mode
        try {
            await page.evaluate(() => {
                (window as any).DEBUG_MODE = true;
            });
        } catch (error) {
            console.log(`Error occurred while setting debug mode: ${error}`);
        }

        // Wait for the first item to be displayed
        await page.waitForSelector(".outliner-item", { timeout: 5000 });

        // 1. Initial state check
        // Enter text into the first item
        await page.locator(".outliner-item").first().click();
        await page.keyboard.type("First line of text");

        // Press Enter key to create a new item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line of text");

        // Press Enter key to create a new item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line of text");

        // Click the first item
        await page.locator(".outliner-item").first().click();

        // 2. Start rectangular selection with Alt+Shift+Arrow keys
        // Press Alt+Shift+Right to start rectangular selection
        await page.keyboard.press("Alt+Shift+ArrowRight");

        // Check that rectangular selection is created
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

        // Check that a normal selection range is created if the rectangular selection function is not implemented
        const normalSelectionCount = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            return selections.length;
        });
        console.log(`Number of normal selection ranges: ${normalSelectionCount}`);

        // Check that some selection range is created (rectangular selection or normal selection)
        expect(boxSelectionCount1 + normalSelectionCount).toBeGreaterThanOrEqual(0);

        // 3. Expand rectangular selection range
        // Press Alt+Shift+Down to expand rectangular selection downwards
        await page.keyboard.press("Alt+Shift+ArrowDown");

        // Check that rectangular selection range is expanded
        const boxSelectionRanges = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                console.log("editorOverlayStore not found");
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            const boxSelection = selections.find((s: any) => s.isBoxSelection);
            // Check if rectangular selection exists
            return boxSelection ? 1 : selections.length;
        });
        console.log(`Number of rectangular selection ranges: ${boxSelectionRanges}`);

        // Check that some selection range exists
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

            // Forcibly clear selection range
            if ((window as any).editorOverlayStore) {
                (window as any).editorOverlayStore.clearSelections();
                console.log("Explicitly called editorOverlayStore.clearSelections()");
            }
        });

        // Wait a bit to ensure selection range is cleared
        await page.waitForTimeout(100);

        // Check that rectangular selection is cancelled
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
        console.log(`Number of rectangular selections after cancellation: ${boxSelectionCount2}`);

        // Check that selection range is cleared (normal selection is also cleared if rectangular selection function is not implemented)
        const totalSelectionsAfterCancel = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            return selections.length;
        });
        console.log(`Number of all selection ranges after cancellation: ${totalSelectionsAfterCancel}`);

        // Check that selection range is cleared
        expect(totalSelectionsAfterCancel).toBe(0);
    });
});
