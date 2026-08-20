import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-53f59906
 *  Title   : Yjs + PGlite database tables
 *  Source  : docs/client-features/tbl-yjs-pglite-database-tables-53f59906.yaml
 */
import { expect, test } from "@playwright/test";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-53f59906: unioned row identity (source_kind/source_id) editability", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table anchor", "Ship the feature"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        // Project the second outline item onto the calendar surface by giving
        // it a `due`: the field the `outline_items` relation projects on
        // (client/src/services/yjstable/itemsRelation.ts).
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            items.at(1).due = "2026-08-01T09:00:00Z";
        });
    });

    test("a UNION carrying source_kind/source_id is editable, and edits reach the right relation and row", async ({ page }) => {
        // A table whose own columns match the calendar projection's shape, so
        // the same result columns can be written back on either side.
        await page.locator(".outliner-item").first().click();
        await page.waitForTimeout(300);
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await createPanel.getByTestId("yjs-table-name-input").fill("routine occurrences");
        await createPanel.getByTestId("yjs-table-create").click();

        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });
        await expect(view.getByTestId("yjs-table-sql-name")).toHaveText("routine_occurrences");

        await view.getByTestId("yjs-table-toggle-schema").click();
        const editor = view.getByTestId("yjs-table-schema-editor");
        const schemaEditor = new SqlEditorHelper(editor.getByTestId("yjs-table-schema-input"));
        await schemaEditor.waitForReady();
        await schemaEditor.setValue(
            page,
            "CREATE TABLE routine_occurrences (\n  id TEXT PRIMARY KEY,\n  text TEXT,\n  due TIMESTAMPTZ\n)",
        );
        await editor.getByTestId("yjs-table-schema-apply").click();
        await editor.getByTestId("yjs-table-schema-warning").waitFor({ timeout: 20000 });
        await editor.getByTestId("yjs-table-schema-confirm").click();

        // Add one row through the table's own (bare-id) query first: the
        // union query below carries no add-row control, by design (#4273 -
        // INSERT into a unioned result needs an explicit destination the grid
        // does not offer yet).
        await view.getByTestId("yjs-table-toggle-ui").click();
        const queryEditor = new SqlEditorHelper(view.getByTestId("yjs-table-query-input"));
        await queryEditor.fillAndCommit(page, "SELECT id, text, due FROM routine_occurrences");
        const grid = view.getByTestId("yjs-table-grid");
        await expect(grid.locator("th", { hasText: "text" })).toBeVisible({ timeout: 30000 });
        await grid.getByTestId("yjs-table-add-row").click();
        await page.waitForTimeout(3000);

        // Switch to the calendar-style UNION: rows carry source_kind/source_id
        // instead of a single relation's id.
        await queryEditor.fillAndCommit(
            page,
            "SELECT 'routine_occurrences' AS source_kind, id AS source_id, text, due FROM routine_occurrences "
                + "UNION ALL "
                + "SELECT 'outline_items' AS source_kind, id AS source_id, text, due FROM outline_items",
        );

        await expect(grid.locator("tbody tr")).toHaveCount(2, { timeout: 30000 });
        // Both branches stay editable: no "read-only" reason, and the data
        // columns carry no read-only mark.
        await expect(grid.getByTestId("grid-readonly-reason")).toHaveCount(0);
        await expect(grid.locator("th", { hasText: "text" }).locator(".readonly-mark")).toHaveCount(0);

        const tableRow = grid.locator("tbody tr").filter({
            has: page.locator('td[data-col="source_kind"]', { hasText: "routine_occurrences" }),
        });
        const itemRow = grid.locator("tbody tr").filter({
            has: page.locator('td[data-col="source_kind"]', { hasText: "outline_items" }),
        });

        // Edit the table branch's row: the write must land on the table.
        await tableRow.locator('td[data-col="text"] .cell-value').click();
        await tableRow.locator('td[data-col="text"] input.cell-input').fill("Water the plants", { force: true });
        await page.keyboard.press("Enter");
        await expect(tableRow.locator('td[data-col="text"] .cell-value', { hasText: "Water the plants" }))
            .toBeVisible({ timeout: 15000 });

        // Edit the outline_items branch's row: the write must reach the item,
        // not the table (issue #4273's write-routing requirement). The grid
        // itself is not asserted here: a table's adapter only re-runs its
        // query on its own data/schema/query-text changes (tableSyncAdapter.ts),
        // not when a referenced sibling relation changes elsewhere, so the
        // live outline item — a direct Yjs binding — is the reliable signal
        // that the write landed on the right row.
        await itemRow.locator('td[data-col="text"] .cell-value').click();
        await itemRow.locator('td[data-col="text"] input.cell-input').fill(
            "Ship the redesigned feature",
            { force: true },
        );
        await page.keyboard.press("Enter");

        // Scoped to the item's own text node (.item-content), not the whole
        // .outliner-item subtree: the anchor item embeds this very table
        // block, so its rendered grid cells would otherwise false-match.
        await expect(page.locator(".item-content", { hasText: "Ship the redesigned feature" }))
            .toBeVisible({ timeout: 15000 });
        // The table row's own edit did not leak into the outline item.
        await expect(page.locator(".item-content", { hasText: "Water the plants" })).toHaveCount(0);
    });
});
