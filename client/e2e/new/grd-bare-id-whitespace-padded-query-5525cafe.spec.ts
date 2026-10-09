/** @feature GRD-5515cafe */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { seedOverlappingTableFixture, snapshotProject } from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

test(
    "a trailing-space SELECT keeps the Grid editable and writes only to its source Table",
    async ({ page }, testInfo) => {
        test.setTimeout(240000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        const gridId = await fixture.gridA.getAttribute("data-grid-id");
        expect(gridId).toBeTruthy();

        // Commit the same SQL with one trailing ASCII space through the real
        // Query (SELECT) editor. SQL execution ignores the padding, but the
        // persisted Grid query keeps it (issue #5525).
        const queryEditor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
        await queryEditor.waitForReady();
        const unpadded = await queryEditor.value();
        expect(unpadded).toContain(`FROM ${fixture.tableA.sqlName}`);
        const padded = `${unpadded} `;
        await queryEditor.fillAndCommit(page, padded);

        // The persisted SELECT keeps the trailing space verbatim.
        await expect.poll(async () => {
            const persisted = await snapshotProject(page);
            return persisted.tables.find(table => table.id === fixture.tableA.id)?.ui.query;
        }, { timeout: 30000 }).toBe(padded);

        // Once the current execution completes, the Grid stays editable instead
        // of reporting unvalidated query provenance. This observes the real
        // YjsTableView bare-id authority derivation: a view-level strict-equality
        // gate would leave the read-only reason mounted and fail here.
        const grid = fixture.gridA.getByTestId("yjs-table-grid");
        await expect(
            grid.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"] button.cell-value`),
        ).toHaveText("Value from A", { timeout: 30000 });
        await expect(fixture.gridA.getByTestId("grid-readonly-reason")).toHaveCount(0, { timeout: 30000 });

        // A real Grid cell edit lands only on the proven source record.
        const cell = grid.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await cell.locator("button.cell-value").click();
        await cell.locator("input.cell-input").fill("Padded query edit");
        await page.keyboard.press("Enter");

        const state = await snapshotProject(page);
        expect(state.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId].title)
            .toBe("Padded query edit");
        expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId].title)
            .toBe("Value from B");
        expect(state.tables.find(table => table.id === fixture.tableA.id)?.ui.query).toBe(padded);

        // Reload through ordinary persistence: the edit, the trailing space, and
        // editability all survive.
        await page.reload();
        const reloadedCell = fixture.gridA.getByTestId("yjs-table-grid")
            .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await expect(reloadedCell.locator("button.cell-value")).toHaveText("Padded query edit", { timeout: 30000 });
        await expect(fixture.gridA.getByTestId("grid-readonly-reason")).toHaveCount(0, { timeout: 30000 });
        const reloaded = await snapshotProject(page);
        expect(reloaded.tables.find(table => table.id === fixture.tableA.id)?.ui.query).toBe(padded);

        // Valid editing is still possible after the reload.
        await reloadedCell.locator("button.cell-value").click();
        await reloadedCell.locator("input.cell-input").fill("Still editable");
        await page.keyboard.press("Enter");
        await expect(reloadedCell.locator("button.cell-value")).toHaveText("Still editable", { timeout: 30000 });
        const final = await snapshotProject(page);
        expect(final.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId].title)
            .toBe("Still editable");
        expect(final.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId].title)
            .toBe("Value from B");
    },
);
