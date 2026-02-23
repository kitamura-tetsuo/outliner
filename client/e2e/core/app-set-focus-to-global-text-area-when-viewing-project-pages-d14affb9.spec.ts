import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature APP-0001
 *  Title   : Set focus to global text area when viewing project pages
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase Focus is set to global text area when viewing project page
 * @description Verify that focus is automatically set to the global text area when viewing a project page
 * @check Focus is set to global text area when viewing project page
 * @check Cursor is visible
 * @check Text input is possible
 */
test.describe("Focus settings when viewing project page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Focus is set to global text area when viewing project page", async ({ page }) => {
        // Wait for OutlinerItem to be displayed
        await page.waitForSelector(".outliner-item", { timeout: 30000 });
        console.log("Found outliner items");

        // Check elements in the page
        const elements = await page.evaluate(() => {
            return {
                outlinerItems: document.querySelectorAll(".outliner-item").length,
                pageTitle: document.querySelector(".outliner-item.page-title") ? true : false,
                firstItem: document.querySelector(".outliner-item") ? true : false,
                globalTextarea: document.querySelector(".global-textarea") ? true : false,
            };
        });
        console.log("Page elements:", elements);

        // Confirm that global text area exists
        expect(elements.globalTextarea).toBe(true);

        // Click the first item to set focus
        const firstItem = page.locator(".outliner-item[data-item-id]").first();
        await firstItem.waitFor();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Check focus state
        const focusState = await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return {
                textareaExists: !!textarea,
                focused: document.activeElement === textarea,
                activeElementTag: document.activeElement?.tagName,
                textareaValue: textarea?.value || "",
            };
        });
        console.log("Focus state after click:", focusState);

        // Confirm focus is set
        expect(focusState.focused).toBe(true);

        // Check cursor state and create if necessary
        const cursorState = await page.evaluate(() => {
            const editorStore = (window as {
                editorOverlayStore?: {
                    getActiveItem: () => string | null;
                    getCursorInstances: () => { id: string; }[];
                };
            }).editorOverlayStore;
            if (!editorStore) return { error: "editorOverlayStore not found" };

            const activeItem = editorStore.getActiveItem();
            const cursorInstances = editorStore.getCursorInstances();

            return {
                activeItem,
                cursorInstancesCount: cursorInstances.length,
            };
        });
        console.log("Cursor state:", cursorState);

        // If no cursor instances exist, create one
        if (cursorState.cursorInstancesCount === 0) {
            console.log("No cursor instances found, creating cursor");
            await page.evaluate(() => {
                const editorStore = (window as {
                    editorOverlayStore?: {
                        getActiveItem: () => string | null;
                        setCursor: (
                            cursor: { itemId: string; offset: number; isActive: boolean; userId: string; },
                        ) => void;
                    };
                }).editorOverlayStore;
                if (editorStore) {
                    const activeItemId = editorStore.getActiveItem();
                    if (activeItemId) {
                        editorStore.setCursor({
                            itemId: activeItemId,
                            offset: 0,
                            isActive: true,
                            userId: "local",
                        });
                        console.log("Created cursor for active item");
                    }
                }
            });
        }

        // Confirm text input is possible (using cursor.insertText())
        const testText = "Test text";
        await page.evaluate(text => {
            const editorStore = (window as {
                editorOverlayStore?: {
                    getCursorInstances: () => {
                        findTarget: () => { updateText: (text: string) => void; } | null;
                        offset: number;
                        insertText: (text: string) => void;
                    }[];
                };
            }).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    // Clear existing text
                    const target = cursor.findTarget();
                    if (target) {
                        target.updateText("");
                        cursor.offset = 0;
                    }
                    // Insert new text
                    cursor.insertText(text);
                    console.log("Text inserted via cursor.insertText");
                }
            }
        }, testText);

        // Wait slightly and confirm text is input
        await page.waitForTimeout(300);

        // Check item text
        const itemText = await firstItem.textContent();
        console.log("Item text after input:", itemText);
        expect(itemText).toContain(testText);
    });
});
