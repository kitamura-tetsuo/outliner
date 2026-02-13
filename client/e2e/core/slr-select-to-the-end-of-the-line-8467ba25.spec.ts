import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0003
 *  Title   : Select to the end of the line
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0003: Select to the end of the line", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Seed with 3 lines
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["First line", "Second line", "Third line"]);
        // Wait for Title + 3 items
        await TestHelpers.waitForOutlinerItems(page, 4, 10000);

        // Select the first item and display the cursor
        const item = page.locator(".outliner-item").first();
        await item.waitFor({ state: "visible" });
        await item.locator(".item-content").click({ force: true });

        await page.waitForSelector("textarea.global-textarea:focus");
        await TestHelpers.waitForCursorVisible(page);
    });

    test("Select from current position to end of line using Shift + End", async ({ page }) => {
        // Wait for the cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Get active item ID
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // Get active item
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // Move cursor to the middle of the line
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // Verify that no selection exists initially
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector(".editor-overlay .selection") !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // Press Shift + End
        await page.keyboard.down("Shift");
        await page.keyboard.press("End");
        await page.keyboard.up("Shift");

        // Wait for update
        await page.waitForTimeout(100);

        // Verify that a selection has been created
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();

        // Get selection text (from the application's selection management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify that selection exists
        expect(selectionText.length).toBeGreaterThan(0);
    });

    test("In multi-line items, select to the end of the line where the cursor is located", async ({ page }) => {
        // Wait for the cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Get active item ID
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // Get active item
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // Move cursor to the 3rd line and place it in the middle
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // Verify that no selection exists initially
        const initialSelectionExists = await page.evaluate(() => {
            return document.querySelector(".editor-overlay .selection") !== null;
        });
        expect(initialSelectionExists).toBe(false);

        // Press Shift + End
        await page.keyboard.down("Shift");
        await page.keyboard.press("End");
        await page.keyboard.up("Shift");

        // Wait for update (ensure sufficient time)
        await page.waitForTimeout(300);

        // Verify that a selection has been created
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();

        // Get selection text (from the application's selection management system)
        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Verify that selection exists
        expect(selectionText.length).toBeGreaterThan(0);
    });
});
