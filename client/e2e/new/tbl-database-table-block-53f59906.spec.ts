import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-53f59906
 *  Title   : Yjs + PGlite database tables
 *  Source  : docs/client-features/tbl-yjs-pglite-database-tables-53f59906.yaml
 */
import { expect, test } from "@playwright/test";
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
        await page.waitForTimeout(1000);

        // Edit the title cell (text cell: click to edit, Enter to commit).
        // Whether fill() itself already triggers the cell's commit-on-blur is
        // environment-dependent -- in some environments the input is still
        // there afterwards (needs Enter), in others it has already unmounted
        // back to ".cell-value" (Enter would hang waiting for a now-detached
        // element). Bound the Enter attempt and retry the whole
        // click -> fill -> commit cycle a few times so a lost keystroke race
        // doesn't fail the test outright.
        const committedTitleCell = grid.locator('td[data-col="title"] .cell-value', { hasText: "Write the report" });
        for (let attempt = 0; attempt < 3; attempt++) {
            const titleCell = row.locator('td[data-col="title"] .cell-value');
            await expect(titleCell).toBeVisible({ timeout: 10000 });
            await titleCell.click();
            const titleInput = row.locator('td[data-col="title"] input');
            await expect(titleInput).toBeVisible({ timeout: 5000 });
            await titleInput.fill("Write the report");
            await titleInput.press("Enter", { timeout: 3000 }).catch(() => {});
            if (await committedTitleCell.isVisible({ timeout: 5000 }).catch(() => false)) break;
        }

        // The edit goes Yjs -> PGlite -> debounced re-query -> grid
        await expect(committedTitleCell).toBeVisible({ timeout: 15000 });

        // The status select carries the CHECK constraint options
        const statusSelect = row.locator('td[data-col="status"] select');
        await expect(statusSelect).toBeVisible();
        const options = await statusSelect.locator("option").allTextContents();
        expect(options).toContain("open");
        expect(options).toContain("done");
    });
});
