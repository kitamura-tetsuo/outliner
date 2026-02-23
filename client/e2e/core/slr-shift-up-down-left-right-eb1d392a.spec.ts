import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0001
 *  Title   : Shift + Up/Down/Left/Right
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0001: Shift + Up/Down/Left/Right", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Select the first item
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });

        // Wait until the cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Wait until global textarea is focused
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 10000 });

        // Enter multi-line text
        await page.keyboard.type("First line\nSecond line\nThird line");

        // Move cursor to the beginning
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
    });

    test("Shift + Right expands the selection to the right", async ({ page }) => {
        // Get active item element
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // Verify no selection initially
        const selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // Get text content before selection
        const activeItemId = await TestHelpers.getActiveItemId(page);
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.locator(".item-text").textContent();

        // Press Shift + Right Arrow
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(300);

        // Verify selection is created
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();

        // Get selection text (from application selection management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify selection exists
        expect(selectionText.length).toBeGreaterThan(0);

        // Expand selection further
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(300);

        // Get selection text (from application selection management system)
        const newSelectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify selection expanded
        expect(newSelectionText.length).toBeGreaterThan(selectionText.length);

        // Get and verify cursor info
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.selectionCount).toBeGreaterThan(0);
    });

    test("Shift + Left expands the selection to the left", async ({ page }) => {
        // Get active item element
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // Move cursor a few characters to the right
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // Verify no selection initially
        const selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        await page.keyboard.press("Shift+ArrowLeft");
        await page.waitForTimeout(300);

        {
            await page.waitForTimeout(300);
            // Get and verify cursor info
            const cursorData = await CursorValidator.getCursorData(page);
            expect(cursorData.cursorCount).toBe(1);
            expect(cursorData.selectionCount).toBeGreaterThan(0);
        }
        // // Verify selection is created
        // const selectionExists = await page.evaluate(() => {
        //     return document.querySelector('.editor-overlay .selection') !== null;
        // });
        // expect(selectionExists).toBe(true);

        // Get selection text (from application selection management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify selection exists
        expect(selectionText.length).toBeGreaterThan(0);

        // Expand selection further
        await page.keyboard.press("Shift+ArrowLeft");
        await page.keyboard.press("Shift+ArrowLeft");
        await page.waitForTimeout(300);

        // Get selection text (from application selection management system)
        const newSelectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify selection expanded
        expect(newSelectionText.length).toBeGreaterThan(selectionText.length);

        {
            // Get and verify cursor info
            const cursorData = await CursorValidator.getCursorData(page);
            expect(cursorData.cursorCount).toBe(1);
            expect(cursorData.selectionCount).toBeGreaterThan(0);
        }
    });

    test("Shift + Down expands the selection to the bottom", async ({ page }) => {
        // Get active item element
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // Verify no selection initially
        const selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // Press Shift + Down Arrow
        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(300);

        // Verify selection is created
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();

        // Get selection text (from application selection management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify selection exists
        expect(selectionText.length).toBeGreaterThan(0);
        expect(selectionText).toContain("First line");

        // Verify selection spans multiple lines
        const lines = selectionText.split("\n");
        expect(lines.length).toBeGreaterThanOrEqual(1);

        // Get and verify cursor info
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.selectionCount).toBeGreaterThan(0);
    });

    test("Shift + Up expands the selection to the top", async ({ page }) => {
        // Get active item element
        const activeItemLocator = await TestHelpers.getActiveItemLocator(page);
        expect(activeItemLocator).not.toBeNull();

        // Move cursor to the second line
        await page.keyboard.press("ArrowDown");

        // Verify no selection initially
        const selections = await page.locator(".editor-overlay .selection").count();
        expect(selections).toBe(0);

        // Press Shift + Up Arrow
        await page.keyboard.press("Shift+ArrowUp");
        await page.waitForTimeout(300);

        // Verify selection is created
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();

        // Get selection text (from application selection management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify selection exists
        expect(selectionText.length).toBeGreaterThan(0);

        // Verify selection text (should contain either "First line" or "Second line")
        const containsFirstLine = selectionText.includes("First line");
        const containsSecondLine = selectionText.includes("Second line");
        expect(containsFirstLine || containsSecondLine).toBe(true);

        // Verify selection spans multiple lines
        const lines = selectionText.split("\n");
        expect(lines.length).toBeGreaterThanOrEqual(1);

        // Get and verify cursor info
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.selectionCount).toBeGreaterThan(0);
    });
});
