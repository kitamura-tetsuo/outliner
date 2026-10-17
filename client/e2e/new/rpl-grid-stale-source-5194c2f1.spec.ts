/** @feature FTR-5194c2f1 */
import { expect, test } from "@playwright/test";
import {
    pointGridAToTableB,
    seedOverlappingTableFixture,
    snapshotProject,
} from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

test("Replace Current refuses a held match after its physical source record is removed", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    await pointGridAToTableB(page, fixture);

    await page.getByTestId("search-toggle-button").click();
    await page.locator("#search-scope").selectOption("page");
    await page.getByTestId("search-input").fill("Value from B");
    await page.getByTestId("replace-input").fill("Must not be recreated");
    await page.getByTestId("search-button").click();
    await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2", { timeout: 30000 });
    await page.getByTestId("search-result-button").first().click();

    // Remove the record through the same guarded production Grid boundary
    // after SearchPanel captured it, leaving the held match intentionally stale.
    await fixture.gridA.getByRole("button", { name: `Delete row ${fixture.recordId}` }).click();
    await expect.poll(async () => {
        const state = await snapshotProject(page);
        return state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId];
    }).toBeUndefined();
    const historyAfterDelete = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);

    await page.getByTestId("replace-button").click();
    await expect(page.getByTestId("replace-status")).toContainText("changed or could not be revalidated");
    expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(historyAfterDelete);
    const state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]).toBeUndefined();
});

test("Replace Current refuses a held match after an A-to-B-to-A query incarnation change", async ({
    page,
}, testInfo) => {
    test.setTimeout(180000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    await pointGridAToTableB(page, fixture);

    await page.getByTestId("search-toggle-button").click();
    await page.locator("#search-scope").selectOption("page");
    await page.getByTestId("search-input").fill("Value from B");
    await page.getByTestId("replace-input").fill("Fresh authority only");
    await page.getByTestId("search-button").click();
    await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2", { timeout: 30000 });
    await page.getByTestId("search-result-button").first().click();

    // Re-run the placement through a different source and then restore the
    // displayed SQL. Although the final rows look identical to the held hit,
    // each completed Project SELECT has a distinct mutation incarnation.
    const query = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
    await query.fillAndCommit(page, `SELECT id, title, done FROM ${fixture.tableA.sqlName}`);
    await expect(fixture.gridA.getByTestId("yjs-table-grid")).toContainText("Value from A", { timeout: 30000 });
    await query.fillAndCommit(page, `SELECT id, title, done FROM ${fixture.tableB.sqlName}`);
    await expect(fixture.gridA.getByTestId("yjs-table-grid")).toContainText("Value from B", { timeout: 30000 });
    const historyAfterRefresh = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);

    await page.getByTestId("replace-button").click();
    await expect(page.getByTestId("replace-status")).toContainText("changed or could not be revalidated");
    await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2");
    expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(historyAfterRefresh);
    let state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId]?.title).toBe(
        "Value from A",
    );
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title).toBe(
        "Value from B",
    );

    // A separately initiated Find captures the live incarnation and may write.
    await page.getByTestId("search-button").click();
    await page.getByTestId("search-result-button").first().click();
    await page.getByTestId("replace-button").click();
    await expect(page.getByTestId("replace-status")).toContainText("Replaced 1 Grid cell");
    await expect.poll(async () => {
        state = await snapshotProject(page);
        return state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title;
    }).toBe("Fresh authority only");
});
