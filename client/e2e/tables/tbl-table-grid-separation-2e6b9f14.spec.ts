/** @feature FTR-2e6b9f14 */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-2e6b9f14 (issue #5012): /tables/<project>/<tableId> is a page about the
// Table entity — schema + raw data — and never renders one of its Grids as if
// it were the table. The demo's occurrences table has two Grids, so picking
// "the first one" would be visibly arbitrary.
test.describe("Standalone table page is about the table, not a grid", () => {
    test("shows the implicit SELECT * raw data instead of a grid presentation", async ({ page }) => {
        await page.goto("/tables/demo/demo-table-routine-occurrences");

        const tableView = page.getByTestId("table-entity-view");
        await expect(tableView).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId("table-raw-query"))
            .toHaveText("SELECT * FROM routine_occurrences");

        // Every column of the table, in schema order — no Grid hid or renamed one.
        const grid = tableView.getByTestId("yjs-table-grid");
        await expect(grid.locator("th", { hasText: "template_id" })).toBeVisible({ timeout: 30000 });
        await expect(grid.locator("th", { hasText: "occurrence_date" })).toBeVisible();

        // No Grid view is mounted on a Table page.
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(0);
    });

    test("lists every grid over the table as a link rather than a mounted result", async ({ page }) => {
        await page.goto("/tables/demo/demo-table-routine-occurrences");

        const references = page.getByTestId("table-grid-references");
        await expect(references).toBeVisible({ timeout: 30000 });

        const defaultGrid = references.locator("[data-grid-id='demo-table-routine-occurrences-grid']");
        const historyGrid = references.locator(
            "[data-grid-id='demo-table-routine-occurrences-history-grid']",
        );
        await expect(defaultGrid).toBeVisible({ timeout: 30000 });
        await expect(historyGrid).toBeVisible();
        await expect(historyGrid).toHaveAttribute(
            "href",
            "/grids/demo/demo-table-routine-occurrences-history-grid",
        );
    });
});
