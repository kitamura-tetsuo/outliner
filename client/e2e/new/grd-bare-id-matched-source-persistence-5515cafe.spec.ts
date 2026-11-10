/** @feature GRD-5515cafe */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { seedOverlappingTableFixture, snapshotProject } from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

test("a matched saved Grid commits only to its source Table and survives reload", async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    const gridId = await fixture.gridA.getAttribute("data-grid-id");
    expect(gridId).toBeTruthy();

    const queryEditor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
    await queryEditor.fillAndCommit(page, `SELECT id, title AS value, done FROM ${fixture.tableA.sqlName}`);

    const cell = fixture.gridA.getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${fixture.recordId}"][data-col="value"]`);
    await cell.locator("button.cell-value").click();
    const editor = cell.locator("textarea.cell-input");
    await editor.fill("Committed only");
    await editor.press("Alt+Enter");
    await editor.type("to A");
    await expect(editor).toHaveValue("Committed only\nto A");
    await page.keyboard.press("Enter");

    const state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId].title)
        .toBe("Committed only\nto A");
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId].title)
        .toBe("Value from B");

    await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/grids/${gridId}`);
    await page.reload();
    const reloadedCell = page.getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${fixture.recordId}"][data-col="value"]`);
    await expect(reloadedCell.locator("button.cell-value")).toHaveText("Committed only\nto A", { timeout: 30000 });

    // Load B through its own Table surface before checking persisted subdoc
    // data; the standalone A Grid intentionally does not connect every sibling
    // Table subdoc merely so a test helper can inspect it.
    await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/tables/${fixture.tableB.id}`);
    const tableBCell = page.getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
    await expect(tableBCell.locator("button.cell-value")).toHaveText("Value from B", { timeout: 30000 });
});

test("a saved same-Table UNION refuses multiline drafts when one branch computes the aliased value",
    async ({ page }, testInfo) => {
        test.setTimeout(240000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        const queryEditor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
        await queryEditor.fillAndCommit(
            page,
            `SELECT '${fixture.tableA.sqlName}' AS source_kind, id AS source_id, title AS value FROM ${fixture.tableA.sqlName} `
                + `UNION ALL SELECT '${fixture.tableA.sqlName}', id, title || '!' FROM ${fixture.tableA.sqlName}`,
        );

        const grid = fixture.gridA.getByTestId("yjs-table-grid");
        await expect(grid.locator("tbody tr")).toHaveCount(2, { timeout: 30000 });
        await expect(grid.getByTestId("grid-readonly-reason")).toHaveCount(0);
        const originalState = await snapshotProject(page);

        // Both results have a verified Table row source, but neither occurrence
        // can be attributed to the physical or computed value branch.
        for (const displayedValue of ["Value from A", "Value from A!"]) {
            const row = grid.locator("tbody tr").filter({
                has: grid.locator('td[data-col="value"] button.cell-value').filter({
                    hasText: displayedValue.endsWith("!") ? /^Value from A!$/ : /^Value from A$/,
                }),
            });
            const cell = row.locator('td[data-col="value"]');
            await cell.locator("button.cell-value").click();
            const editor = cell.locator("textarea.cell-input");
            await editor.fill("selection remains");
            await editor.evaluate(node => (node as HTMLTextAreaElement).setSelectionRange(1, 5));
            await editor.press("Alt+Enter");
            await expect(editor).toHaveValue("selection remains");
            await expect(editor).toBeFocused();
            await expect.poll(() =>
                editor.evaluate(node => [
                    (node as HTMLTextAreaElement).selectionStart,
                    (node as HTMLTextAreaElement).selectionEnd,
                ])
            ).toEqual([1, 5]);
            await expect(row.getByRole("alert")).toContainText("does not accept line breaks");

            await page.evaluate(() => navigator.clipboard.writeText("one\r\ntwo"));
            await editor.press("Control+V");
            await expect(editor).toHaveValue("selection remains");
            await expect.poll(() =>
                editor.evaluate(node => [
                    (node as HTMLTextAreaElement).selectionStart,
                    (node as HTMLTextAreaElement).selectionEnd,
                ])
            ).toEqual([1, 5]);
            await editor.press("Escape");
            await expect(cell.locator("textarea.cell-input")).toHaveCount(0);
        }
        expect(await snapshotProject(page)).toEqual(originalState);
        expect(originalState.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId].title)
            .toBe("Value from A");
    });
