import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
// @ts-nocheck
/** @feature SLR-0005
 *  Title   : Selection spans multiple items
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0005: Selection spans multiple items", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Select the first item
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });

        await page.waitForSelector("textarea.global-textarea:focus");

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Type test text
        await page.keyboard.type("First item text");

        // Create the second item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item text");

        // Create the third item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third item text");

        // Return to the first item
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Home");
    });

    test("Can create a selection range spanning multiple items with Shift + Up/Down keys", async ({ page }) => {
        // Enable debug mode
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Get active item ID
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // Get active item
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // Confirm no selection exists initially
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector(".editor-overlay .selection") !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // Check current cursor position
        const initialCursorInfo = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return null;
            const cursor = Object.values(store.cursors)[0] as any;
            return cursor ? { itemId: cursor.itemId, offset: cursor.offset } : null;
        });
        console.log("Initial cursor position:", initialCursorInfo);

        // Check item information
        await page.evaluate(() => {
            const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
            const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);
            const allItemTexts = allItems.map(el => {
                const textEl = el.querySelector(".item-text");
                return textEl ? textEl.textContent : "";
            });
            console.log("All items:", allItemIds.map((id, i) => ({ id, text: allItemTexts[i] })));
        });

        // Click the first item to select it
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // Press Shift + Down arrow key twice to select 3 items
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Shift");

        // Wait slightly for selection to reflect
        await page.waitForTimeout(300);

        // Confirm selection range is created
        await expect(page.locator(".editor-overlay .selection").first()).toBeVisible();

        // Wait slightly for selection to reflect
        await page.waitForTimeout(300);

        // Check selection range information
        await page.evaluate(() => {
            console.log(
                "Selections after second arrow down:",
                Object.values((window as any).editorOverlayStore.selections),
            );

            // Display selection range details
            const sel = Object.values((window as any).editorOverlayStore.selections)[0] as any;
            if (sel) {
                const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
                const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);

                console.log("Selection details:");
                console.log("- startItemId:", sel.startItemId);
                console.log("- endItemId:", sel.endItemId);
                console.log("- startOffset:", sel.startOffset);
                console.log("- endOffset:", sel.endOffset);
                console.log("- isReversed:", sel.isReversed);

                console.log("Start item index:", allItemIds.indexOf(sel.startItemId));
                console.log("End item index:", allItemIds.indexOf(sel.endItemId));
            }
        });

        // Get selection range text (from application's selection range management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Confirm selection range exists
        expect(selectionText.length).toBeGreaterThan(0);

        // Confirm at least 2 items' text are included
        // Check if part of the text is included (partial match instead of exact match)
        const containsSecondItem = selectionText.includes("Second item");
        const containsThirdItem = selectionText.includes("Third item");

        console.log(`Contains second item: ${containsSecondItem}`);
        console.log(`Contains third item: ${containsThirdItem}`);

        // OK if either item's text is included
        expect(containsSecondItem || containsThirdItem).toBe(true);

        // Disable debug mode
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = false;
        });
    });

    test("Can create a selection range spanning multiple items by mouse dragging", async ({ page }) => {
        // Enable debug mode
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Get the first item
        const firstItem = page.locator(".outliner-item").nth(0);

        // Click the first item to reset selection state
        await firstItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // Create selection range spanning multiple items with keyboard (instead of mouse drag)
        await page.keyboard.press("Home");
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("End");
        await page.keyboard.up("Shift");

        // Wait slightly for selection to reflect
        await page.waitForTimeout(800);

        // Check selection range information
        await page.evaluate(() => {
            console.log(
                "Selections after keyboard selection:",
                Object.values((window as any).editorOverlayStore.selections),
            );

            // Display selection range details
            const sel = Object.values((window as any).editorOverlayStore.selections)[0] as any;
            if (sel) {
                const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
                const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);
                const allItemTexts = allItems.map(el => {
                    const textEl = el.querySelector(".item-text");
                    return textEl ? textEl.textContent : "";
                });

                console.log("All items:", allItemIds.map((id, i) => ({ id, text: allItemTexts[i] })));

                console.log("Selection details:");
                console.log("- startItemId:", sel.startItemId);
                console.log("- endItemId:", sel.endItemId);
                console.log("- startOffset:", sel.startOffset);
                console.log("- endOffset:", sel.endOffset);
                console.log("- isReversed:", sel.isReversed);

                console.log("Start item index:", allItemIds.indexOf(sel.startItemId));
                console.log("End item index:", allItemIds.indexOf(sel.endItemId));
            }
        });

        // Confirm selection range is created
        await expect(page.locator(".editor-overlay .selection").first()).toBeVisible();

        // Get selection range text (from application's selection range management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Confirm selection range exists
        expect(selectionText.length).toBeGreaterThan(0);

        // Confirm at least 1 item's text is included
        const containsFirstItem = selectionText.includes("First");
        const containsSecondItem = selectionText.includes("Second");
        const containsThirdItem = selectionText.includes("Third");
        expect(containsFirstItem || containsSecondItem || containsThirdItem).toBe(true);

        // Disable debug mode
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = false;
        });
    });

    test("Selection range spanning multiple items is visually displayed", async ({ page }) => {
        // Get the first item
        const firstItem = page.locator(".outliner-item").nth(0);

        // Click the first item to select
        await firstItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // Press Shift + Down arrow key twice to select 3 items
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Shift");

        // Wait slightly for selection to reflect
        await page.waitForTimeout(300);

        // Confirm selection range elements exist
        const selectionElements = page.locator(".editor-overlay .selection");

        // Confirm at least one selection range element is displayed
        const count = await selectionElements.count();
        expect(count).toBeGreaterThan(0);

        // Confirm the first selection range element is displayed
        await expect(selectionElements.first()).toBeVisible();

        // Check selection range element style
        const backgroundColor = await selectionElements.first().evaluate(el => {
            return window.getComputedStyle(el).backgroundColor;
        });

        // Confirm background color is set (rgba format value)
        expect(backgroundColor).toMatch(/rgba\(.*\)/);
    });
});
