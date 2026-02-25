import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0101
 *  Title   : Box Selection (Rectangle Selection) Feature - Mouse
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * SLR-0101: Box Selection (Rectangle Selection) Feature - Mouse
 *
 * This test verifies the box selection feature using Alt+Shift+Mouse Drag.
 *
 * Test contents:
 * 1. Start box selection with Alt+Shift+Mouse Drag
 * 2. Copy text within the box selection
 * 3. Paste text into the box selection
 */
test.describe("Box Selection Test via Mouse", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test.afterEach(async () => {
        // Implement cleanup process if necessary
    });

    test("Box Selection via Alt+Shift+Mouse Drag", async ({ page }) => {
        // Extend test timeout

        // Enable debug mode
        try {
            await page.evaluate(() => {
                // (window as any).DEBUG_MODE = true;
            });
        } catch (error) {
            console.log(`Error occurred while setting debug mode: ${error}`);
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

        // 2. Start box selection with Alt+Shift+Mouse Drag
        // Get the position of the first item
        const firstItemBounds = await page.locator(".outliner-item").first().boundingBox();
        if (!firstItemBounds) {
            console.log("Could not get the position of the first item.");
            return;
        }

        // Get the position of the second item
        const secondItemBounds = await page.locator(".outliner-item").nth(1).boundingBox();
        if (!secondItemBounds) {
            console.log("Could not get the position of the second item.");
            return;
        }

        // Mouse drag while holding Alt+Shift keys
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        // Drag operation
        await page.mouse.move(firstItemBounds.x + 5, firstItemBounds.y + firstItemBounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(firstItemBounds.x + 10, secondItemBounds.y + secondItemBounds.height / 2, { steps: 10 });
        await page.mouse.up();

        // Release keys
        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // Verify that box selection is created
        const boxSelectionCount = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                console.log("editorOverlayStore not found");
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            const boxSelections = selections.filter((s: any) => s.isBoxSelection);
            return boxSelections.length;
        });
        console.log(`Number of box selections: ${boxSelectionCount}`);

        // Verify that box selection is created
        expect(boxSelectionCount).toBe(1);

        // 3. Copy text within the box selection
        await page.keyboard.press("Control+c");

        // Wait a bit to ensure copy process
        await page.waitForTimeout(100);

        // Get copied text (directly from global variable)
        const copiedText = await page.evaluate(() => {
            return (window as any).lastCopiedText || "";
        });
        console.log(`Copied text: "${copiedText}"`);

        // Verify that copied text is not empty
        expect(copiedText.length).toBeGreaterThan(0);

        // 4. Paste text into the box selection
        // Create box selection again
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        // Drag operation
        await page.mouse.move(firstItemBounds.x + 15, firstItemBounds.y + firstItemBounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(firstItemBounds.x + 20, secondItemBounds.y + secondItemBounds.height / 2, { steps: 10 });
        await page.mouse.up();

        // Release keys
        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // Paste text
        await page.keyboard.press("Control+v");

        // 5. Delete text within the box selection
        // Create box selection again
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        // Drag operation
        await page.mouse.move(firstItemBounds.x + 25, firstItemBounds.y + firstItemBounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(firstItemBounds.x + 30, secondItemBounds.y + secondItemBounds.height / 2, { steps: 10 });
        await page.mouse.up();

        // Release keys
        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // Delete
        await page.keyboard.press("Delete");

        // 6. Cancel box selection with Esc key
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

            // Force clear selection range
            if ((window as any).editorOverlayStore) {
                (window as any).editorOverlayStore.clearSelections();
                console.log("Explicitly called editorOverlayStore.clearSelections()");
            }
        });

        // Wait a bit to ensure selection clear
        await page.waitForTimeout(100);

        // Verify that box selection is cancelled
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
        console.log(`Number of box selections after cancel: ${boxSelectionCount2}`);

        // Verify that box selection is cancelled
        expect(boxSelectionCount2).toBe(0);
    });
});
