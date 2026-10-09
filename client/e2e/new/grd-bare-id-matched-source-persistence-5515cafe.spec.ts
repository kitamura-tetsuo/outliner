/** @feature GRD-5515cafe */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { seedOverlappingTableFixture, snapshotProject } from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("a matched saved Grid commits only to its source Table and survives reload", async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    const gridId = await fixture.gridA.getAttribute("data-grid-id");
    expect(gridId).toBeTruthy();

    const cell = fixture.gridA.getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
    await cell.locator("button.cell-value").click();
    await cell.locator("input.cell-input").fill("Committed only to A");
    await page.keyboard.press("Enter");

    let state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId].title)
        .toBe("Committed only to A");
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId].title)
        .toBe("Value from B");

    await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/grids/${gridId}`);
    await page.reload();
    const reloadedCell = page.getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
    await expect(reloadedCell.locator("button.cell-value")).toHaveText("Committed only to A", { timeout: 30000 });
    state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId].title)
        .toBe("Value from B");
});
