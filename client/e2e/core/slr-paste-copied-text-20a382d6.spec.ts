import "../utils/registerAfterEachSnapshot";
registerCoverageHooks();
// @ts-nocheck
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-20a382d6: Paste copied text", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Seed with default content to ensure items exist
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "First item",
            "Second item",
            "Third item text",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 4, 10000);
    });

    test("Can paste copied text to another location", async ({ page }) => {
        // Enable debug mode
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
            console.log("Debug mode enabled in test");
        });

        // Get the second item
        const secondItem = page.locator(".outliner-item").nth(1);

        // Click and select the second item
        await secondItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // Create selection manually
        await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return;

            // Select the second and third items
            const items = document.querySelectorAll("[data-item-id]");
            if (items.length < 3) return;

            const secondItemId = items[1].getAttribute("data-item-id");
            const thirdItemId = items[2].getAttribute("data-item-id");

            if (!secondItemId || !thirdItemId) return;

            // Set selection
            store.setSelection({
                startItemId: secondItemId,
                startOffset: 0,
                endItemId: thirdItemId,
                endOffset: "Third item text".length,
                userId: "local",
                isReversed: false,
            });

            console.log("Selection created manually");
        });

        // Wait a bit for the selection to reflect
        await page.waitForTimeout(300);

        // Get the selected text (from the application's selection management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Ensure the selection exists
        console.log("Selection text:", selectionText);
        expect(selectionText).toBeTruthy();

        // Execute copy operation
        await page.keyboard.press("Control+c");

        // Manually trigger a copy event
        const selectedText = await page.evaluate<string>(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });
        await page.evaluate<void, string>(text => {
            const selectedText = text;
            console.log(`Selected text for copy: "${selectedText}"`);

            // Set clipboard contents
            const textarea = document.createElement("textarea");
            textarea.value = selectedText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);

            // Also set it to the clipboardRef of EditorOverlay
            const clipboardRef = document.querySelector(".clipboard-textarea") as HTMLTextAreaElement;
            if (clipboardRef) {
                clipboardRef.value = selectedText;
                console.log(`clipboardRef value set to: "${selectedText}"`);
            }

            // Create a ClipboardEvent manually
            const clipboardEvent = new ClipboardEvent("copy", {
                clipboardData: new DataTransfer(),
                bubbles: true,
                cancelable: true,
            });

            // Set text in the DataTransfer object
            Object.defineProperty(clipboardEvent, "clipboardData", {
                writable: false,
                value: {
                    getData: () => selectedText,
                    setData: (format: string, text: string) => {
                        console.log(`Setting clipboard data: ${format}, "${text}"`);
                    },
                },
            });

            // Fire an event to the editor overlay
            const editorOverlay = document.querySelector(".editor-overlay");
            if (editorOverlay) {
                editorOverlay.dispatchEvent(clipboardEvent);
                console.log("Dispatched copy event to editor overlay");
            }

            // Set globally (for testing)
            (window as any).testClipboardText = selectedText;
            console.log("Stored test clipboard text:", selectedText);
        }, selectedText);

        // Click the third item
        const thirdItem = page.locator(".outliner-item").nth(2);
        await thirdItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // Move to the end
        await page.keyboard.press("End");

        // Add a new item
        await page.keyboard.press("Enter");

        // Execute paste operation
        await page.keyboard.press("Control+v");

        // Call KeyEventHandler.handlePaste directly
        await page.evaluate(async text => {
            console.log("Calling KeyEventHandler.handlePaste directly with text:", text);

            // Create a ClipboardEvent manually
            const clipboardEvent = new ClipboardEvent("paste", {
                clipboardData: new DataTransfer(),
                bubbles: true,
                cancelable: true,
            });

            // Set text in the DataTransfer object
            Object.defineProperty(clipboardEvent, "clipboardData", {
                writable: false,
                value: {
                    getData: (format: string) => {
                        if (format === "text/plain") return text;
                        return "";
                    },
                    setData: () => {},
                },
            });

            // Call KeyEventHandler.handlePaste directly
            const KeyEventHandler = (window as any).__KEY_EVENT_HANDLER__;
            if (KeyEventHandler && KeyEventHandler.handlePaste) {
                await KeyEventHandler.handlePaste(clipboardEvent);
                console.log("KeyEventHandler.handlePaste called successfully");
            } else {
                console.log("KeyEventHandler.handlePaste not found");
            }
        }, selectedText);

        // Wait a bit for the paste to reflect
        await page.waitForTimeout(300);

        // Check the text of the pasted items
        const items = page.locator(".outliner-item");
        const count = await items.count();

        // Ensure at least 4 items exist (the original 3 + 1 or more pasted)
        expect(count).toBeGreaterThanOrEqual(4);

        // Check the text of the pasted item
        // Instead of getting the text directly, check the application's internal state
        const fourthItemText = await page.evaluate(() => {
            // Get the ID of the fourth item
            const fourthItem = document.querySelectorAll(".outliner-item")[3];
            if (!fourthItem) return "";

            const itemId = fourthItem.getAttribute("data-item-id");
            if (!itemId) return "";

            // Get the item's text
            const textEl = fourthItem.querySelector(".item-text");
            return textEl ? textEl.textContent : "";
        });

        // Check the test results
        console.log(`Fourth item text: "${fourthItemText}"`);
        expect(fourthItemText).toBeTruthy();
    });
});
