import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5514c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { snapshotProject } from "../utils/gridMutationProvenanceHelpers";
import { prepareTypedGridSources } from "../utils/gridRuntimeHelpers";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";

test(
    "UNION rows use branch metadata and guarded fields while ambiguous results remain copyable",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await prepareTypedGridSources(page, testInfo);
        const grid = fixture.gridA;
        const branch = (sqlName: string) =>
            `SELECT '${sqlName}' AS source_kind, id AS source_id, title AS title, done AS done FROM ${sqlName}`;
        await new SqlEditorHelper(grid.getByTestId("yjs-table-query-input")).fillAndCommit(
            page,
            `${branch(fixture.tableA.sqlName)} UNION ALL ${branch(fixture.tableB.sqlName)}`,
        );
        const aRow = grid.locator(`tr[data-record-id="${fixture.tableA.sqlName}:${fixture.recordId}"]`);
        const bRow = grid.locator(`tr[data-record-id="${fixture.tableB.sqlName}:${fixture.recordId}"]`);
        await expect(aRow.locator('td[data-col="title"] button')).toHaveText("Value from A");
        await expect(bRow.locator('td[data-col="title"] select')).toHaveValue("Value from B");
        await expect(grid.getByTestId("grid-query-dependencies").locator("a")).toHaveCount(2);
        await expect(bRow.locator('td[data-col="title"] select')).toBeEnabled();
        await bRow.locator('td[data-col="title"] select').focus();
        await bRow.locator('td[data-col="title"] select').selectOption("B changed");
        await expect.poll(async () =>
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]
                ?.title
        ).toBe("B changed");
        expect(
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId]
                ?.title,
        ).toBe("Value from A");
        const before = (await snapshotProject(page)).tables.map(table => ({ id: table.id, data: table.data }));
        const plain = (sqlName: string) => `SELECT id AS id, title AS title, done AS done FROM ${sqlName}`;
        await new SqlEditorHelper(grid.getByTestId("yjs-table-query-input")).fillAndCommit(
            page,
            `${plain(fixture.tableA.sqlName)} UNION ALL ${plain(fixture.tableB.sqlName)}`,
        );
        await expect(grid.getByTestId("grid-readonly-reason")).toBeVisible();
        await expect(grid.getByTestId("yjs-table-grid").locator('td[data-col="title"] button')).toHaveCount(2);
        await grid.getByRole("columnheader", { name: "Select current query result", exact: true }).click();
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Value from A");
        expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("B changed");
        await grid.getByTestId("yjs-table-add-row").click();
        await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText(/select|choose|ambiguous/i);
        expect((await snapshotProject(page)).tables.map(table => ({ id: table.id, data: table.data }))).toEqual(before);
    },
);
