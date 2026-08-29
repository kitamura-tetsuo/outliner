import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-53f59906
 *  Title   : Yjs + PGlite database tables
 *  Source  : docs/client-features/tbl-yjs-pglite-database-tables-53f59906.yaml
 */
import { expect, test } from "../fixtures/grid-render-trace";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-53f59906: Yjs + PGlite database table block", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Database table demo item"]);
    });

    test("create a Tasks preset table and edit it through the grid", async ({ page }) => {
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        await page.locator(".outliner-item").first().click();
        await page.waitForTimeout(300);

        // Insert a Database block from the toolbar
        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        // The create panel appears; create a table from the Tasks preset
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();

        // The view mounts and the grid renders the preset columns (PGlite
        // loads lazily, so allow generous time for the first query).
        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });
        const grid = page.getByTestId("yjs-table-grid").first();
        await expect(grid.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });
        await expect(grid.locator("th", { hasText: "status" })).toBeVisible();

        // Add a row; select cells default to the first CHECK option ("open")
        await page.getByTestId("yjs-table-add-row").first().click();
        const row = grid.locator("tbody tr").first();
        await expect(row).toBeVisible({ timeout: 10000 });

        // Let the add-row round trip (Yjs -> PGlite -> debounced re-query)
        // settle before editing so the cell is not re-rendered mid-edit.
        await page.waitForTimeout(3000);

        // Edit the title cell (text cell: click to edit, Enter to commit)
        const titleCell = row.locator('td[data-col="title"] .cell-value');
        await expect(titleCell).toBeVisible({ timeout: 15000 });
        await titleCell.click();
        const titleInput = row.locator('td[data-col="title"] input.cell-input');
        await expect(titleInput).toBeVisible({ timeout: 15000 });
        await titleInput.fill("Write the report", { force: true });
        await page.keyboard.press("Enter");

        // The edit goes Yjs -> PGlite -> debounced re-query -> grid
        await expect(
            grid.locator('td[data-col="title"] .cell-value', { hasText: "Write the report" }),
        ).toBeVisible({ timeout: 15000 });

        // The status select carries the CHECK constraint options
        const statusSelect = row.locator('td[data-col="status"] select');
        await expect(statusSelect).toBeVisible();
        const options = await statusSelect.locator("option").allTextContents();
        expect(options).toContain("open");
        expect(options).toContain("done");
    });

    test("row deletion requires confirmation", async ({ page }) => {
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        await page.locator(".outliner-item").first().click();
        await page.waitForTimeout(300);

        // Insert a Database block from the toolbar
        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        // The create panel appears; create a table from the Tasks preset
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();

        // Wait for the block to render the grid
        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });
        const grid = view.getByTestId("yjs-table-grid");
        await expect(grid.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });

        // Add a row
        await grid.getByTestId("yjs-table-add-row").click();
        const row = grid.locator("tbody tr").first();
        await expect(row).toBeVisible({ timeout: 10000 });

        // Get initial row count
        const initialRowCount = await grid.locator("tbody tr").count();

        // IMPORTANT: since default behavior now is NO confirmation, we must manually turn it on in the UI def panel to test it here
        const uiToggleButton = view.getByTestId("yjs-table-toggle-ui");
        await uiToggleButton.click({ force: true });

        const uiEditor = view.getByTestId("yjs-table-ui-editor");
        await expect(uiEditor).toBeVisible({ timeout: 10000 });

        const toggleCheckbox = uiEditor.locator("label:has-text('Confirm before deleting rows') input");
        await toggleCheckbox.waitFor({ state: "attached" });
        await toggleCheckbox.check({ force: true });

        // Wait for it to sync
        await page.waitForTimeout(500);
        await uiToggleButton.click({ force: true });

        // Click delete button
        await page.evaluate(() => {
            const btns = document.querySelectorAll("button.delete-row");
            if (btns.length > 0) btns[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        // Dialog appears, cancel it
        const dialog = page.locator("dialog[open]");
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await dialog.getByRole("button", { name: "Cancel" }).click();

        // Ensure dialog is closed and row is still there
        await expect(dialog).not.toBeVisible();
        expect(await grid.locator("tbody tr").count()).toBe(initialRowCount);

        // Click delete again
        await page.evaluate(() => {
            const btns = document.querySelectorAll("button.delete-row");
            if (btns.length > 0) btns[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        // Dialog appears, confirm it
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await dialog.getByRole("button", { name: "Delete" }).click();

        // Ensure dialog is closed and row is gone
        await expect(dialog).not.toBeVisible();
        await expect.poll(async () => grid.locator("tbody tr").count(), { timeout: 10000 }).toBe(initialRowCount - 1);
    });
});
