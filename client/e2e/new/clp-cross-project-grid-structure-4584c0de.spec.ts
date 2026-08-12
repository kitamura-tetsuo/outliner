/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    copyGridHosts,
    createBlankGrid,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

// #4816: copying a selection that crosses a Grid and pasting it into another
// project must clone the table's structure (schema/UI/name) into a brand new
// destination table instead of falling back to plain text. Its rows are read
// from the live source at paste time and rebuilt in independent Data Storage.
test.describe("cross-project Grid paste clones table structure and data", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test(
        "pasting a Grid into another project creates a fresh populated clone",
        async ({ page }, testInfo) => {
            test.setTimeout(180000);
            const fixture = await seedCrossProjectFixture(page, testInfo);

            // Build a non-default Grid in the source project and give it a record.
            await createBlankGrid(page, "Orders", "orders");
            await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
            await addSourceRecord(page);
            const sourceState = await readGridProjectState(page);
            expect(sourceState.tables).toHaveLength(1);
            const sourceTable = sourceState.tables[0];
            expect(sourceTable.dataSize).toBe(1);

            await copyGridHosts(page);

            // Navigate to the destination project via Svelte-managed routing only.
            await openProjectPage(page, fixture, "destination");

            // Warm up the destination with an unrelated Grid first: a fresh
            // page's very first Database interaction is unreliable for the
            // native Ctrl+V event in this environment (see helper docstring).
            await createBlankGrid(page, "Warmup", "warmup_table");
            const warmupState = await readGridProjectState(page);
            expect(warmupState.tables).toHaveLength(1);
            const warmupTableId = warmupState.tables[0].id;

            await pasteAtAnchor(page, 2);

            const destinationState = await readGridProjectState(page);
            expect(destinationState.guid).not.toBe(sourceState.guid);
            expect(destinationState.tables).toHaveLength(2);
            const destinationTable = destinationState.tables.find(t => t.id !== warmupTableId)!;
            expect(destinationTable).toBeTruthy();

            // Fresh identity: different table id and a subdoc GUID owned by the
            // destination project, never the source project's table id/GUID.
            expect(destinationTable.id).not.toBe(sourceTable.id);
            expect(destinationTable.guid).not.toBe(sourceTable.guid);
            expect(destinationTable.guid).toContain(destinationState.guid);
            expect(new Set(destinationState.hostTableIds)).toEqual(new Set([warmupTableId, destinationTable.id]));

            // Structure matches copy-time source. The clone always
            // materializes an explicit columnOrder, so normalize that field.
            expect(destinationTable.name).toBe(sourceTable.name);
            expect(destinationTable.sqlName).toBe(sourceTable.sqlName);
            expect(destinationTable.schema.replace(/\s+/g, " ")).toBe(sourceTable.schema.replace(/\s+/g, " "));
            expect(destinationTable.ui).toEqual({ columnOrder: [], ...sourceTable.ui });

            expect(destinationTable.dataSize).toBe(1);

            // The rendered Grid shows the cloned schema/UI and copied row.
            const view = page.getByTestId("yjs-table-view").filter({
                has: page.locator("th", { hasText: "Order title" }),
            });
            await expect(view).toBeVisible({ timeout: 30000 });
            await expect(view.getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(1);

            // The source table is untouched (still 1 record, same id/GUID).
            await openProjectPage(page, fixture, "source");
            const sourceStateAfter = await readGridProjectState(page);
            expect(sourceStateAfter.tables).toHaveLength(1);
            expect(sourceStateAfter.tables[0].id).toBe(sourceTable.id);
            expect(sourceStateAfter.tables[0].guid).toBe(sourceTable.guid);
            expect(sourceStateAfter.tables[0].dataSize).toBe(1);
        },
    );

    test(
        "SQL-name conflicts are resolved without modifying the pre-existing destination table",
        async ({ page }, testInfo) => {
            test.setTimeout(180000);
            const fixture = await seedCrossProjectFixture(page, testInfo);

            await createBlankGrid(page, "Orders", "orders");
            await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
            const sourceState = await readGridProjectState(page);
            const sourceTable = sourceState.tables[0];

            await copyGridHosts(page);

            // The destination project already has a table using the same SQL
            // name ("orders"), so the clone must be renamed deterministically
            // rather than colliding with (or overwriting) the existing table.
            await openProjectPage(page, fixture, "destination");
            await createBlankGrid(page, "Existing Orders", "orders");
            const preExistingState = await readGridProjectState(page);
            expect(preExistingState.tables).toHaveLength(1);
            const preExistingTable = preExistingState.tables[0];

            await pasteAtAnchor(page, 2);

            const afterFirstPaste = await readGridProjectState(page);
            expect(afterFirstPaste.tables).toHaveLength(2);
            const clonedTable = afterFirstPaste.tables.find(t => t.id !== preExistingTable.id)!;
            expect(clonedTable).toBeTruthy();
            expect(clonedTable.sqlName).not.toBe("orders");
            expect(clonedTable.sqlName.startsWith("orders")).toBe(true);
            expect(clonedTable.schema).toContain(clonedTable.sqlName);
            // The pre-existing destination table is untouched.
            const preservedExisting = afterFirstPaste.tables.find(t => t.id === preExistingTable.id)!;
            expect(preservedExisting.sqlName).toBe("orders");

            await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });
            const sqlNames = await page.locator("[data-testid='yjs-table-sql-name']").allTextContents();
            // One view is the pre-existing table (sqlName "orders"), the
            // other the freshly cloned one from paste.
            expect(sqlNames).toContain("orders");
            expect(sqlNames).toContain(clonedTable.sqlName);
            expect(clonedTable.name).toBe(sourceTable.name);
            expect(clonedTable.dataSize).toBe(0);
        },
    );
});
