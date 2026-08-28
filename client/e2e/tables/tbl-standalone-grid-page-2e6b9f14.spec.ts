/** @feature FTR-2e6b9f14 */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
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
});
