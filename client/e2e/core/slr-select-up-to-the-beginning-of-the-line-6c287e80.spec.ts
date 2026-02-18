import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0002
 *  Title   : Select up to the beginning of the line
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0002: Select up to the beginning of the line", () => {
    // Set test timeout to 120 seconds

    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Select the first item
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });

        // Wait for the cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Wait for the global textarea to be focused
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 10000 });

        // Enter test text (explicitly entering newlines)
        await page.keyboard.type("First line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line");

        // Move the cursor to the middle of the second line
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
    });

    test("Select from the current position to the beginning of the line with Shift + Home", async ({ page }) => {
        // Get the active item element
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // Move the cursor to the middle of the line
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // Verify that there is no initial selection
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector(".editor-overlay .selection") !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // Press Shift + Home
        await page.keyboard.down("Shift");
        await page.keyboard.press("Home");
        await page.keyboard.up("Shift");

        // Wait for update
        await page.waitForTimeout(100);

        // Verify that a selection has been created
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();

        // Get the selection text (from the application's selection management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify that the selection exists
        expect(selectionText.length).toBeGreaterThan(0);

        // Get and verify cursor information
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.selectionCount).toBeGreaterThan(0);
    });

    test("In a multi-line item, select up to the beginning of the current line", async ({ page }) => {
        // Get the active item element
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // Clear the text once and enter new text
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // Enter multi-line text
        await page.keyboard.type("First line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line with more text");

        // Move the cursor to the middle of the third line
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // Verify that there is no initial selection
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector(".editor-overlay .selection") !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // Check current cursor position
        const cursorData = await CursorValidator.getCursorData(page);
        console.log("Current cursor position:", cursorData.cursors[0]);

        // Press Shift + Home
        await page.keyboard.down("Shift");
        await page.keyboard.press("Home");
        await page.keyboard.up("Shift");

        // Wait for update
        await page.waitForTimeout(300);

        // Verify that a selection has been created
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();

        // Get the selection text (from the application's selection management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify that the selection exists
        expect(selectionText.length).toBeGreaterThan(0);

        // Get and verify cursor information
        const updatedCursorData = await CursorValidator.getCursorData(page);
        expect(updatedCursorData.cursorCount).toBe(1);
        expect(updatedCursorData.selectionCount).toBeGreaterThan(0);
    });
});
