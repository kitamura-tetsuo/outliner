import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-53f59906
 *  Title   : Yjs + PGlite database tables
 *  Source  : docs/client-features/tbl-yjs-pglite-database-tables-53f59906.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-53f59906: chart view toggle", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Database table demo item"]);
    });

    test("toggling the Chart view renders a chart once rows exist, and hides it when toggled off", async ({ page }) => {
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

        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });
        const grid = page.getByTestId("yjs-table-grid").first();
        await expect(grid.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });

        // Add a row and set a numeric column so the chart has a bar to draw.
        await page.getByTestId("yjs-table-add-row").first().click();
        const row = grid.locator("tbody tr").first();
        await expect(row).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(1000);

        const titleCell = row.locator('td[data-col="title"] .cell-value');
        await expect(titleCell).toBeVisible({ timeout: 10000 });
        await titleCell.click();
        const titleInput = row.locator('td[data-col="title"] input');
        await expect(titleInput).toBeVisible({ timeout: 5000 });
        await titleInput.fill("Chart-worthy task");
        await titleInput.press("Enter");
        await expect(
            grid.locator('td[data-col="title"] .cell-value', { hasText: "Chart-worthy task" }),
        ).toBeVisible({ timeout: 15000 });

        const repeatDaysCell = row.locator('td[data-col="repeat_days"] .cell-value');
        await expect(repeatDaysCell).toBeVisible({ timeout: 10000 });
        await repeatDaysCell.click();
        const repeatDaysInput = row.locator('td[data-col="repeat_days"] input');
        await expect(repeatDaysInput).toBeVisible({ timeout: 5000 });
        await repeatDaysInput.fill("7");
        await repeatDaysInput.press("Enter");
        await expect(
            grid.locator('td[data-col="repeat_days"] .cell-value', { hasText: "7" }),
        ).toBeVisible({ timeout: 15000 });

        // The chart panel is not mounted until the toggle is clicked.
        await expect(page.getByTestId("yjs-table-chart")).toHaveCount(0);

        await page.getByTestId("yjs-table-toggle-chart").first().click();
        const chart = page.getByTestId("yjs-table-chart").first();
        await expect(chart).toBeVisible({ timeout: 10000 });
        await expect(chart.locator(".no-data")).toHaveCount(0, { timeout: 10000 });
        await expect(chart.locator("canvas")).toBeVisible({ timeout: 10000 });

        // Toggling off unmounts the chart panel again.
        await page.getByTestId("yjs-table-toggle-chart").first().click();
        await expect(page.getByTestId("yjs-table-chart")).toHaveCount(0);
    });
});
