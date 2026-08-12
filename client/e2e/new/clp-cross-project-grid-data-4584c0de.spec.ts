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
    setCellValue,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

// #4864: the clipboard carries structure only, so the rows of a Grid pasted
// into another project are read from the live source at paste time. They land
// in Data Storage of their own: from that instant the two tables are unrelated.
test.describe("cross-project Grid paste copies the source rows", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test(
        "the clone arrives with the source rows and then diverges from the source",
        async ({ page }, testInfo) => {
            test.setTimeout(180000);
            const fixture = await seedCrossProjectFixture(page, testInfo);

            await createBlankGrid(page, "Orders", "orders");
            await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
            await addSourceRecord(page);
            await addSourceRecord(page, 0, 2);
            // Give the two rows distinct values so the clone can be compared
            // record by record, not merely counted.
            const [firstRecordId, secondRecordId] = Object.keys(
                (await readGridProjectState(page)).tables[0].data,
            );
            await setCellValue(page, 0, firstRecordId, "title", "First order");
            await setCellValue(page, 0, secondRecordId, "title", "Second order");

            const sourceState = await readGridProjectState(page);
            const sourceTable = sourceState.tables[0];
            expect(sourceTable.dataSize).toBe(2);
            expect(sourceTable.data[firstRecordId].title).toBe("First order");

            await copyGridHosts(page);
            await openProjectPage(page, fixture, "destination");

            // Warm up the destination with an unrelated Grid first: a fresh
            // page's very first Database interaction is unreliable for the
            // native Ctrl+V event in this environment (see helper docstring).
            await createBlankGrid(page, "Warmup", "warmup_table");
            const warmupTableId = (await readGridProjectState(page)).tables[0].id;

            await pasteAtAnchor(page, 2);

            const destinationState = await readGridProjectState(page);
            const clone = destinationState.tables.find(table => table.id !== warmupTableId)!;
            // Every record, with every column value, arrived under its own id.
            expect(clone.data).toEqual(sourceTable.data);

            const cloneView = page.getByTestId("yjs-table-view").filter({
                has: page.locator("th", { hasText: "Order title" }),
            });
            await expect(cloneView.getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(2, {
                timeout: 30000,
            });

            // Independent from this instant: an edit and an insert on the clone
            // stay in the destination project.
            const cloneIndex = await page.getByTestId("yjs-table-view").evaluateAll(
                (views, label: string) =>
                    views.findIndex(view =>
                        Array.from(view.querySelectorAll("th")).some(header =>
                            header.textContent?.includes(label) ?? false
                        )
                    ),
                "Order title",
            );
            expect(cloneIndex).toBeGreaterThanOrEqual(0);
            await setCellValue(page, cloneIndex, firstRecordId, "title", "Edited in the destination");
            await addSourceRecord(page, cloneIndex, 3);

            const afterEdit = await readGridProjectState(page);
            expect(afterEdit.tables.find(table => table.id === clone.id)!.dataSize).toBe(3);

            await openProjectPage(page, fixture, "source");
            const sourceAfter = await readGridProjectState(page);
            expect(sourceAfter.tables).toHaveLength(1);
            // The source kept exactly the rows it had, with their copy-time values.
            expect(sourceAfter.tables[0].data).toEqual(sourceTable.data);
        },
    );
});
