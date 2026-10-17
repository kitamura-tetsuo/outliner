/** @feature FTR-5194c2f1 */
import { expect, test } from "@playwright/test";
import {
    pointGridAToTableB,
    seedOverlappingTableFixture,
    snapshotProject,
} from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
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
    await expect(page.getByTestId("replace-status")).toContainText("Grid Replace failed");
    await expect(page.getByTestId("replace-status")).toContainText("execution evidence is stale");
    expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(historyAfterDelete);
    const state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]).toBeUndefined();
});
