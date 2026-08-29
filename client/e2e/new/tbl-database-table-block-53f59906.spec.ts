import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("FTR-53f59906: Yjs + PGlite database table block", () => {
    test.beforeEach(async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page);

        const rootItem = page.getByTestId("item-container").first();
        const rootTextArea = rootItem.locator("textarea.editor").first();

        // Create initial text node to drop onto later if needed, mostly just setting focus
        await rootTextArea.click();
        await page.waitForTimeout(300);
    });

    test("inserts a new database block and creates a table from preset", async ({ page }) => {
        const rootItem = page.getByTestId("item-container").first();
        const rootTextArea = rootItem.locator("textarea.editor").first();

        await rootTextArea.click();
        await rootTextArea.press("/");
        await page.getByRole("menuitem", { name: "Table / Grid" }).click();

        // The create panel appears
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });

        // Select the "Tasks" preset
        const presetSelect = page.getByTestId("yjs-table-preset-select").first();
        await presetSelect.selectOption("tasks");

        // The table name input should automatically populate with "Tasks"
        const nameInput = page.getByTestId("yjs-table-name-input").first();
        await expect(nameInput).toHaveValue("Tasks");

        // Click create
        await page.getByTestId("yjs-table-create").first().click();

        // The block should now render the grid view
        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 10000 });

        const grid = view.getByTestId("yjs-table-grid");

        // Wait for PGlite to init and the table to sync
        await expect(grid.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });
        await expect(grid.locator("th", { hasText: "status" })).toBeVisible();

        // The Tasks preset seeds 3 rows
        await expect.poll(async () => grid.locator("tbody tr").count(), { timeout: 15000 }).toBe(3);
    });

    test("cell editing updates PGlite database and re-renders", async ({ page }) => {
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

        // Wait for rows to load (should be 3 from Tasks preset)
        await expect.poll(async () => grid.locator("tbody tr").count(), { timeout: 15000 }).toBe(3);

        // Edit the first row's title
        const firstRow = grid.locator("tbody tr").first();
        const titleCell = firstRow.locator("td").filter({ hasText: "Write unit tests" });
        await titleCell.click();
        await titleCell.locator("input").fill("Write E2E tests");
        await titleCell.locator("input").press("Enter");

        // Verify the value updated in the UI
        await expect(firstRow.locator("td").filter({ hasText: "Write E2E tests" })).toBeVisible();

        // Edit the status column (which is a select in the preset)
        const statusCell = firstRow.locator("td[data-col='status']");
        await statusCell.click();
        const statusSelect = statusCell.locator("select");
        await statusSelect.selectOption("done");

        // Verify the status changed
        await expect(statusSelect).toHaveValue("done");

        // Ensure options list contains valid enum values
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
        const deleteButton = row.locator(".delete-row");
        await expect(deleteButton).toBeVisible();
        await deleteButton.click({ force: true });

        // Dialog appears, cancel it
        const dialog = page.getByRole("dialog").filter({ hasText: "Delete row" });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Cancel" }).click();

        // Ensure dialog is closed and row is still there
        await expect(dialog).not.toBeVisible();
        expect(await grid.locator("tbody tr").count()).toBe(initialRowCount);

        // Click delete again
        await deleteButton.click({ force: true });

        // Dialog appears, confirm it
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Delete" }).click();

        // Ensure dialog is closed and row is gone
        await expect(dialog).not.toBeVisible();
        await expect.poll(async () => grid.locator("tbody tr").count(), { timeout: 10000 }).toBe(initialRowCount - 1);
    });
});
