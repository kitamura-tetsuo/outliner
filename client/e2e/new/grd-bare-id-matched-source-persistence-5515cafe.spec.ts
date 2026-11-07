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
