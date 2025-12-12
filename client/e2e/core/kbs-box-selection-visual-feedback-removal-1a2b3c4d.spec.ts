import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature KBS-1a2b3c4d
 *  Title   : Box selection visual feedback removal
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * 矩形選択の視覚フィードバックがタイムアウト後に削除されることを確認する
 */

test.describe("Box selection feedback", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Listen to console messages
        page.on("console", msg => {
            const text = msg.text();
            if (
                text.includes("EditorOverlay:") || text.includes("DEBUG_MODE") || text.includes("attemptToAddClass")
                || text.includes("Step")
            ) {
                console.log("Browser console:", text);
            }
        });

        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test.afterEach(async ({ page }) => {
        // Clean up box selection state to prevent interference with subsequent tests
        try {
            await page.evaluate(() => {
                // Reset debug mode
                (window as any).DEBUG_MODE = false;

                // Cancel box selection via KeyEventHandler
                if ((window as any).KeyEventHandler?.cancelBoxSelection) {
                    (window as any).KeyEventHandler.cancelBoxSelection();
                }

                // Clear editor overlay store selections
                if ((window as any).editorOverlayStore?.clearSelections) {
                    (window as any).editorOverlayStore.clearSelections();
                }
            });
        } catch (error) {
            console.log(`Cleanup error: ${error}`);
        }
    });

    test("selection-box-updating class removed after timeout", async ({ page }) => {
        // Create content first like other working tests do
        await page.locator(".outliner-item").first().click();
        await page.keyboard.type("First line of text");

        // Enterキーを押して新しいアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line of text");

        // Enterキーを押して新しいアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line of text");

        // Get the first item to make sure we have a cursor position
        const firstItemId = await page.evaluate(() => {
            const el = document.querySelector(".outliner-item");
            return el?.getAttribute("data-item-id") || "";
        });
        expect(firstItemId).not.toBe("");

        // Focus the global textarea and position cursor in the first item
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("Home"); // Go to start of line
        await page.locator(".global-textarea").focus();
        await page.waitForTimeout(200);

        // Enable debug mode to help troubleshoot
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
            console.log("DEBUG_MODE enabled:", (window as any).DEBUG_MODE);
        });

        await page.waitForTimeout(100); // Wait for DEBUG_MODE to be set

        // Check if KeyEventHandler is available and get cursor info
        const debugInfo = await page.evaluate(() => {
            const KeyEventHandler = (window as any).KeyEventHandler;
            const store = (window as any).editorOverlayStore;

            if (!KeyEventHandler) {
                return { error: "KeyEventHandler not found" };
            }

            if (!store) {
                return { error: "editorOverlayStore not found" };
            }

            const cursorInstances = store.getCursorInstances();
            return {
                hasKeyEventHandler: !!KeyEventHandler,
                hasStore: !!store,
                cursorCount: cursorInstances.length,
                cursors: cursorInstances.map((c: any) => ({
                    itemId: c.itemId,
                    offset: c.offset,
                    isActive: c.isActive,
                })),
            };
        });

        console.log("Debug info:", debugInfo);

        // Ensure we have a cursor
        if (debugInfo.cursorCount === 0) {
            // Set cursor programmatically
            await page.evaluate(() => {
                const store = (window as any).editorOverlayStore;
                const firstItem = document.querySelector(".outliner-item");
                const itemId = firstItem?.getAttribute("data-item-id");

                if (itemId) {
                    store.setCursor({
                        itemId,
                        offset: 0,
                        isActive: true,
                        userId: "local",
                    });
                }
            });

            await page.waitForTimeout(100);
        }

        // Trigger box selection programmatically
        const result = await page.evaluate(() => {
            const KeyEventHandler = (window as any).KeyEventHandler;
            const store = (window as any).editorOverlayStore;
            const event = new KeyboardEvent("keydown", {
                key: "ArrowRight",
                altKey: true,
                shiftKey: true,
                bubbles: true,
                cancelable: true,
            });

            try {
                KeyEventHandler.handleBoxSelection(event);

                // Check the state after calling handleBoxSelection
                const selections = store.selections;
                const boxSelectionState = KeyEventHandler.boxSelectionState;

                return {
                    success: true,
                    selections: Object.keys(selections).length,
                    boxSelectionActive: boxSelectionState?.active,
                    boxSelectionRanges: boxSelectionState?.ranges?.length,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        });

        console.log("Box selection result:", result);
        await page.waitForTimeout(200); // Allow time for DOM update before checking

        // Get detailed selection info
        const selectionInfo = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            const aliasPickerStore = (window as any).aliasPickerStore;
            const selections = store.selections;

            return {
                aliasPickerVisible: aliasPickerStore?.isVisible,
                navigatorWebdriver: (window as any).navigator?.webdriver,
                selections: Object.entries(selections).map(([key, sel]: [string, any]) => ({
                    key,
                    startItemId: sel.startItemId,
                    startOffset: sel.startOffset,
                    endItemId: sel.endItemId,
                    endOffset: sel.endOffset,
                    isBoxSelection: sel.isBoxSelection,
                    boxSelectionRanges: sel.boxSelectionRanges,
                    isUpdating: sel.isUpdating,
                })),
            };
        });

        console.log("Selection info:", JSON.stringify(selectionInfo, null, 2));

        // Wait a bit for Svelte to render
        await page.waitForTimeout(500);

        // Wait for the .selection-box elements to appear first
        await expect.poll(async () => {
            const count = await page.locator(".selection-box").count();
            console.log(`Selection box count: ${count}`);
            return count;
        }, { timeout: 10000 }).toBeGreaterThan(0);

        // Check immediately after class should be added
        await page.waitForTimeout(100); // Wait for attemptToAddClass to complete

        // Check in browser
        const classCheck = await page.evaluate(() => {
            const elements = document.querySelectorAll(".selection-box");
            return Array.from(elements).map(el => ({
                className: el.className,
                hasUpdatingClass: el.classList.contains("selection-box-updating"),
            }));
        });
        console.log("Class check:", JSON.stringify(classCheck, null, 2));

        const immediateCount = await page.locator(".selection-box-updating").count();
        console.log(`Immediate selection-box-updating count: ${immediateCount}`);

        // Wait for the .selection-box-updating class to appear, which should happen
        // after the selection boxes are rendered and the class is added by KeyEventHandler
        await expect.poll(async () => {
            const count = await page.locator(".selection-box-updating").count();
            console.log(`Selection box updating count: ${count}`);
            return count;
        }, { timeout: 10000 }).toBeGreaterThan(0);

        // Check that the .selection-box-updating class appears (the main assertion of this test)
        const updatingInitial = await page.locator(".selection-box-updating").count();
        expect(updatingInitial).toBeGreaterThan(0);

        await page.waitForTimeout(600);
        const updatingAfter = await page.locator(".selection-box-updating").count();
        expect(updatingAfter).toBe(0);
    });
});
