/** @feature FTR-2e6b9f14 */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-2e6b9f14 (issue #5012): /:project/-/grids/:gridId owns the Grid's own
// SELECT, presentation and result, and references its source Table.
test.describe("Standalone grid page", () => {
    test("renders the grid's own query result and links back to its source table", async ({ page }) => {
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-history-grid");

        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });
        await expect(gridView).toHaveAttribute(
            "data-source-table-id",
            "demo-table-routine-occurrences",
        );
        await expect(page.getByTestId("grid-source-table-link")).toHaveAttribute(
            "href",
            "/demo/-/tables/demo-table-routine-occurrences",
        );

        // This Grid renames occurrence_date and drops cadence; the other Grid
        // over the same Table does not. Two presentations, one Table.
        const grid = gridView.getByTestId("yjs-table-grid");
        await expect(grid.locator("th", { hasText: "Date" })).toBeVisible({ timeout: 30000 });
        await expect(grid.locator("th", { hasText: "cadence" })).toHaveCount(0);
    });

    test("the other grid over the same table keeps its own presentation", async ({ page }) => {
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-grid");

        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });
        const grid = gridView.getByTestId("yjs-table-grid");
        await expect(grid.locator("th", { hasText: "cadence" })).toBeVisible({ timeout: 30000 });
    });

    test("can toggle the Add row button visibility from Grid UI", async ({ page }) => {
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-history-grid");

        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });

        // Wait for table to render completely with the + Add row button
        const addRowButton = gridView.getByTestId("yjs-table-add-row");
        await expect(addRowButton).toBeVisible({ timeout: 30000 });

        // Open UI editor panel
        const uiToggleButton = gridView.getByTestId("yjs-table-toggle-ui");
        await uiToggleButton.click();

        const uiEditor = gridView.getByTestId("yjs-table-ui-editor");
        await expect(uiEditor).toBeVisible({ timeout: 30000 });

        // Uncheck the Show Add row button toggle
        const toggleCheckbox = uiEditor.getByLabel("Show Add row button");
        await expect(toggleCheckbox).toBeChecked();
        await toggleCheckbox.uncheck();
        await expect(toggleCheckbox).not.toBeChecked();

        // Verify the Add row button is hidden
        await expect(addRowButton).not.toBeVisible();

        // Check the toggle again
        await toggleCheckbox.check();

        // Verify the Add row button comes back
        await expect(addRowButton).toBeVisible();
    });
});
