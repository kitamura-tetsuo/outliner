import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-7b3e9c42
 *  Title   : Cross-table aggregation with project-unique SQL names
 *  Source  : docs/client-features/tbl-cross-table-aggregation-7b3e9c42.yaml
 */
import { type Page } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";

/** Insert a Database block on the item at `itemIndex` and create a table. */
async function createTable(page: Page, itemIndex: number, displayName: string): Promise<void> {
    await page.locator(".outliner-item").nth(itemIndex).click();
    await page.waitForTimeout(300);

    const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
    await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
    await addDatabaseBtn.click();

    // Only the block just inserted shows a create panel; earlier blocks have
    // already become table views.
    const createPanel = page.getByTestId("yjs-table-create-panel").first();
    await expect(createPanel).toBeVisible({ timeout: 10000 });
    await createPanel.getByTestId("yjs-table-name-input").fill(displayName);
    await createPanel.getByTestId("yjs-table-create").click();
}

test.describe("FTR-7b3e9c42: cross-table aggregation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Orders table", "Report table"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("a table's query aggregates rows of another table of the project", async ({ page }) => {
        // The SQL name is derived from the display name and shown to the user,
        // so the query below can be written against it.
        await createTable(page, 0, "orders");
        const ordersView = page.getByTestId("yjs-table-view").first();
        await expect(ordersView).toBeVisible({ timeout: 15000 });
        await expect(ordersView.getByTestId("yjs-table-sql-name")).toHaveText("orders");

        // Two rows in the first table.
        const ordersGrid = page.getByTestId("yjs-table-grid").first();
        await expect(ordersGrid.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });
        await page.getByTestId("yjs-table-add-row").first().click();
        await page.waitForTimeout(1500);
        await page.getByTestId("yjs-table-add-row").first().click();
        await page.waitForTimeout(1500);
        await expect(ordersGrid.locator("tbody tr")).toHaveCount(2, { timeout: 20000 });

        // A second table whose query only reads the first one.
        await createTable(page, 1, "report");
        const reportView = page.getByTestId("yjs-table-view").nth(1);
        await expect(reportView).toBeVisible({ timeout: 15000 });
        await expect(reportView.getByTestId("yjs-table-sql-name")).toHaveText("report");

        await reportView.getByTestId("yjs-table-toggle-ui").click();
        const queryEditor = new SqlEditorHelper(reportView.getByTestId("yjs-table-query-input"));
        await queryEditor.fillAndCommit(page, "SELECT COUNT(*) AS order_count FROM orders");

        // The referenced table is materialized on demand: the aggregate counts
        // every row of `orders`, not a partial result.
        const reportGrid = page.getByTestId("yjs-table-grid").nth(1);
        await expect(reportGrid.locator("th", { hasText: "order_count" })).toBeVisible({ timeout: 30000 });
        await expect(reportGrid.locator("tbody tr").first()).toContainText("2", { timeout: 20000 });

        // Aggregated rows have no single source record, so they stay read-only.
        await expect(reportView.getByTestId("yjs-table-query-error")).toHaveCount(0);
    });

    test("an unknown relation reports an error instead of an empty result", async ({ page }) => {
        await createTable(page, 0, "orders");
        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId("yjs-table-grid").first().locator("th", { hasText: "title" }))
            .toBeVisible({ timeout: 30000 });

        await view.getByTestId("yjs-table-toggle-ui").click();
        const queryEditor = new SqlEditorHelper(view.getByTestId("yjs-table-query-input"));
        await queryEditor.fillAndCommit(page, "SELECT COUNT(*) FROM no_such_table");

        await expect(view.getByTestId("yjs-table-query-error")).toContainText("no_such_table", {
            timeout: 30000,
        });
    });
});
