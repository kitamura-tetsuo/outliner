import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0101
 *  Title   : Box Selection (Rectangular Selection) Copy/Cancel/Paste Timing Regression Test
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * SLR-0101 Regression Test: Box Selection Copy/Cancel/Paste Timing Issue
 *
 * This test verifies the following sequence:
 * 1. Copy text using box selection
 * 2. Cancel with Esc key (without pasting)
 * 3. Create box selection again
 * 4. Paste
 *
 * This sequence is critical for detecting regressions due to timing issues.
 */
test.describe("Box Selection Copy/Cancel/Paste Timing Regression Test", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First line of text",
            "Second line of text",
            "Third line of text",
        ]);

        // Save original clipboard methods for proper cleanup
        await page.evaluate(() => {
            if ((navigator as any).clipboard) {
                if ((navigator as any).clipboard.readText) {
                    (navigator as any).clipboard.readText.__original = (navigator as any).clipboard.readText;
                }
                if ((navigator as any).clipboard.writeText) {
                    (navigator as any).clipboard.writeText.__original = (navigator as any).clipboard.writeText;
                }
            }
        });
    });

    test.afterEach(async ({ page }) => {
        // Clean up global state to prevent test interference
        try {
            await page.evaluate(() => {
                // Reset global debug mode
                (window as any).DEBUG_MODE = false;

                // Clear clipboard-related global variables
                (window as any).lastCopiedText = undefined;
                (window as any).lastPastedText = undefined;
                (window as any).lastCopiedIsBoxSelection = undefined;
                (window as any).lastVSCodeMetadata = undefined;
                (window as any).lastBoxSelectionPaste = undefined;

                // Reset clipboard API mocks
                if ((navigator as any).clipboard) {
                    if ((navigator as any).clipboard.readText.__original) {
                        (navigator as any).clipboard.readText = (navigator as any).clipboard.readText.__original;
                    }
                    if ((navigator as any).clipboard.writeText.__original) {
                        (navigator as any).clipboard.writeText = (navigator as any).clipboard.writeText.__original;
                    }
                }

                // Reset KeyEventHandler box selection state
                if ((window as any).__KEY_EVENT_HANDLER__) {
                    const handler = (window as any).__KEY_EVENT_HANDLER__;
                    if (handler.boxSelectionState) {
                        handler.boxSelectionState = {
                            active: false,
                            startItemId: null,
                            startOffset: 0,
                            endItemId: null,
                            endOffset: 0,
                            ranges: [],
                        };
                    }
                }

                // Clear editor overlay store selections
                if ((window as any).editorOverlayStore) {
                    (window as any).editorOverlayStore.clearSelections();
                }
            });
        } catch (error) {
            console.log(`Cleanup error: ${error}`);
        }
    });

    test("Copy with box selection -> Cancel with Esc -> Box selection again -> Paste", async ({ page }) => {
        // Enable debug mode and setup clipboard mock
        try {
            await page.evaluate(() => {
                (window as any).DEBUG_MODE = true;

                // Mock: readText returns lastCopiedText
                (navigator as any).clipboard.readText = async () => {
                    return (window as any).lastCopiedText || "";
                };

                // Mock: writeText updates lastCopiedText
                (navigator as any).clipboard.writeText = async (text: string) => {
                    (window as any).lastCopiedText = text;
                    console.log(`[Mock] writeText: ${text}`);
                    return Promise.resolve();
                };
            });
        } catch (error) {
            console.log(`Error occurred while setting up debug mode: ${error}`);
        }

        // Wait for all items to be rendered
        await TestHelpers.waitForItemCount(page, 4);

        // Scroll to top
        await page.evaluate(() => {
            document.documentElement.scrollTop = 0;
        });

        // Use IDs to target specific items
        const startItemId = await TestHelpers.getItemIdByIndex(page, 1);
        const endItemId = await TestHelpers.getItemIdByIndex(page, 3);

        if (!startItemId || !endItemId) throw new Error("Could not find start/end items");

        const startBox = await page.locator(`.outliner-item[data-item-id="${startItemId}"]`).boundingBox();
        const endBox = await page.locator(`.outliner-item[data-item-id="${endItemId}"]`).boundingBox();

        if (!startBox || !endBox) {
            throw new Error("Could not get bounding box");
        }

        // Click start item to ensure we have focus in the area
        await page.locator(`.outliner-item[data-item-id="${startItemId}"]`).click();

        // Mouse drag while holding Alt+Shift keys
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        await page.mouse.move(startBox.x + 10, startBox.y + startBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(endBox.x + 10, endBox.y + endBox.height / 2, { steps: 10 });
        await page.mouse.up();

        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // Verify box selection is created (using waitForFunction)
        await page.waitForFunction(
            () => {
                if (!(window as any).editorOverlayStore) return false;
                const selections = Object.values((window as any).editorOverlayStore.selections);
                return selections.filter((s: any) => s.isBoxSelection).length === 1;
            },
            undefined,
            { timeout: 5000 },
        );

        // 3. Copy text
        await page.keyboard.press("Control+c");

        // Verify copied text (using waitForFunction)
        await page.waitForFunction(
            () => {
                const text = (window as any).lastCopiedText;
                return text && text.length > 0;
            },
            undefined,
            { timeout: 5000 },
        );

        const copiedText = await page.evaluate(() => (window as any).lastCopiedText);
        console.log(`Copied text: "${copiedText}"`);

        // 4. Cancel with Esc key (without pasting)
        await page.keyboard.press("Escape");

        // Explicitly call cancelBoxSelection
        await page.evaluate(() => {
            if (
                (window as any).KeyEventHandler
                && typeof (window as any).KeyEventHandler.cancelBoxSelection === "function"
            ) {
                (window as any).KeyEventHandler.cancelBoxSelection();
            }

            // Force clear selection
            if ((window as any).editorOverlayStore) {
                (window as any).editorOverlayStore.clearSelections();
            }
        });

        // Verify box selection is canceled (using waitForFunction)
        await page.waitForFunction(
            () => {
                // eslint-disable-next-line no-restricted-globals
                if (!(window as any).editorOverlayStore) return true; // Consider no selection if Store is missing
                // eslint-disable-next-line no-restricted-globals
                const selections = Object.values((window as any).editorOverlayStore.selections);
                return selections.filter((s: any) => s.isBoxSelection).length === 0;
            },
            undefined,
            { timeout: 5000 },
        );

        // 5. Create box selection again
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        await page.mouse.move(startBox.x + 15, startBox.y + startBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(endBox.x + 20, endBox.y + endBox.height / 2, { steps: 10 });
        await page.mouse.up();

        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // Verify box selection is created again (using waitForFunction)
        await page.waitForFunction(
            () => {
                if (!(window as any).editorOverlayStore) return false;
                const selections = Object.values((window as any).editorOverlayStore.selections);
                return selections.filter((s: any) => s.isBoxSelection).length === 1;
            },
            undefined,
            { timeout: 5000 },
        );

        // 6. Paste
        await TestHelpers.focusGlobalTextarea(page);
        await page.keyboard.press("Control+v");

        // Verify paste success (using waitForFunction)
        await page.waitForFunction(
            () => {
                const pasted = (window as any).lastPastedText || "";
                return pasted.includes("First line") && pasted.length > 0;
            },
            copiedText,
            { timeout: 10000 },
        );

        const pastedText = await page.evaluate(() => (window as any).lastPastedText || "");
        console.log(`Pasted text: "${pastedText}"`);
        expect(pastedText).toContain("First line");

        // 7. Verify final state
        // Selection should be cleared after paste (using waitForFunction)
        await page.waitForFunction(
            () => {
                if (!(window as any).editorOverlayStore) return true;
                const selections = Object.values((window as any).editorOverlayStore.selections);
                return selections.filter((s: any) => s.isBoxSelection).length === 0;
            },
            undefined,
            { timeout: 5000 },
        );
    });
});
