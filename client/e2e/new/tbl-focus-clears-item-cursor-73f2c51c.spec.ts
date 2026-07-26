import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-53f59906
 *  Title   : Yjs + PGlite database tables
 *  Source  : docs/client-features/tbl-yjs-pglite-database-tables-53f59906.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe("FTR-53f59906: Yjs + PGlite database table block - Cursor focus clearing", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Database table demo item"]);

        // Insert a Database block
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        await page.locator(".outliner-item").first().click();
        await page.waitForTimeout(300);

        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();

        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 15000 });
    });

    test("clears the item cursor and selection when clicking into the table query input", async ({ page }) => {
        // First place a cursor on the item text (use the second item created by seed)
        const itemText = page.locator(".outliner-item").nth(1).locator(".item-text").first();
        await itemText.click();

        // Make sure a cursor exists via DOM query
        await expect(page.locator(".editor-overlay .cursor.active").first()).toBeVisible({ timeout: 5000 });

        // Count active cursors to ensure it's > 0
        const initialActiveCursors = await page.locator(".editor-overlay .cursor.active").count();
        expect(initialActiveCursors).toBeGreaterThan(0);

        // Click on the UI view toggle to ensure query input is visible
        await page.getByTestId("yjs-table-toggle-ui").first().click();

        // Click into the SQL query input inside the table block
        const queryInput = page.getByTestId("yjs-table-query-input").first();
        await queryInput.click();

        // Verify the item cursor is now cleared (0 active cursors)
        await expect(page.locator(".editor-overlay .cursor.active")).toHaveCount(0);

        // Ensure global textarea is NOT focused
        const globalTextarea = page.locator("textarea.global-textarea");
        await expect(globalTextarea).not.toBeFocused();

        // Type something in the input
        await queryInput.fill("SELECT * FROM tasks");

        // Verify typing didn't leak into the item text
        expect(await itemText.textContent()).toContain("Database table demo item");
    });

    test("clears the item cursor when navigating via Tab into the table query input", async ({ page }) => {
        // Click to set focus on the item
        const itemText = page.locator(".outliner-item").nth(1).locator(".item-text").first();
        await itemText.click();

        await expect(page.locator(".editor-overlay .cursor.active").first()).toBeVisible({ timeout: 5000 });

        const initialActiveCursors = await page.locator(".editor-overlay .cursor.active").count();
        expect(initialActiveCursors).toBeGreaterThan(0);

        // UI View toggle
        await page.getByTestId("yjs-table-toggle-ui").first().click();

        // Ensure the input is visible
        const queryInput = page.getByTestId("yjs-table-query-input").first();
        await expect(queryInput).toBeVisible({ timeout: 5000 });

        // Simulate Tab behavior focusing the input directly
        await queryInput.focus();

        // Verify focus
        await expect(queryInput).toBeFocused();

        // Verify cursor is cleared
        await expect(page.locator(".editor-overlay .cursor.active")).toHaveCount(0);

        const globalTextarea = page.locator("textarea.global-textarea");
        await expect(globalTextarea).not.toBeFocused();
    });
});
