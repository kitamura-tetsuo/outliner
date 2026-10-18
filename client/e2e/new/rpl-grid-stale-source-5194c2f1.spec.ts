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

test(
    "an asynchronous physical-source failure is surfaced without false success or history",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        await pointGridAToTableB(page, fixture);

        await page.getByTestId("search-toggle-button").click();
        await page.locator("#search-scope").selectOption("page");
        await page.getByTestId("search-input").fill("Value from B");
        await page.getByTestId("replace-input").fill("Must not be reported");
        await page.getByTestId("search-button").click();
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2", { timeout: 30000 });
        await page.getByTestId("search-result-button").first().click();
        const historyBeforeFailure = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);

        // Fault-inject at the real physical Y.Map write boundary. The registered
        // TableGrid provider still captures and commits through Project SELECT and
        // GridExistingRowMutationBoundary; only the final source effect rejects.
        await page.evaluate(({ tableId, recordId }) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            const table = project.ydoc.getMap("yjsTables").get(tableId);
            const record = table.get("doc").getMap("data").get(recordId);
            record.set = () => {
                throw new Error("injected physical-source failure");
            };
        }, { tableId: fixture.tableB.id, recordId: fixture.recordId });

        await page.getByTestId("replace-button").click();
        await expect(page.getByTestId("replace-status")).toContainText("Grid Replace failed");
        await expect(page.getByTestId("replace-status")).toContainText("injected physical-source failure");
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2");
        expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(historyBeforeFailure);
        const state = await snapshotProject(page);
        expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title).toBe(
            "Value from B",
        );
    },
);

async function commitQueryWithoutClosingSearch(
    page: import("@playwright/test").Page,
    editor: SqlEditorHelper,
    sql: string,
) {
    await editor.waitForReady();
    await editor.setValue(page, sql);
    // SqlEditorHelper.commit clicks the page background. At the top-left this
    // can hit SearchPanel's toggle while the panel is open, so blur Monaco
    // directly and preserve the held Search session under test.
    await editor.root.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect.poll(() => editor.hasFocus(), { timeout: 10000 }).toBe(false);
}

async function placementIdForGrid(grid: import("@playwright/test").Locator): Promise<string> {
    const placementId = await grid.evaluate(element => element.closest("[data-item-id]")?.getAttribute("data-item-id"));
    if (!placementId) throw new Error("Grid placement identity is unavailable");
    return placementId;
}

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
    const placementId = await placementIdForGrid(fixture.gridA);
    const placementResult = page.locator(
        `[data-testid="search-result-button"][data-placement-id="${placementId}"]`,
    );
    await expect(placementResult).toHaveCount(1);
    await placementResult.click();
    const heldIncarnation = await fixture.gridA.getAttribute("data-mutation-incarnation");
    expect(heldIncarnation).not.toBeNull();

    // Re-run the placement through a different source and then restore the
    // displayed SQL. Although the final rows look identical to the held hit,
    // each completed Project SELECT has a distinct mutation incarnation.
    const query = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
    await commitQueryWithoutClosingSearch(page, query, `SELECT id, title, done FROM ${fixture.tableA.sqlName}`);
    await expect(fixture.gridA.getByTestId("yjs-table-grid")).toContainText("Value from A", { timeout: 30000 });
    await expect.poll(() => fixture.gridA.getAttribute("data-mutation-incarnation"))
        .not.toBe(heldIncarnation);
    const intermediateIncarnation = await fixture.gridA.getAttribute("data-mutation-incarnation");
    await commitQueryWithoutClosingSearch(page, query, `SELECT id, title, done FROM ${fixture.tableB.sqlName}`);
    await expect(fixture.gridA.getByTestId("yjs-table-grid")).toContainText("Value from B", { timeout: 30000 });
    await expect.poll(() => fixture.gridA.getAttribute("data-mutation-incarnation"))
        .not.toBe(intermediateIncarnation);
    const historyAfterRefresh = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);

    // A Grid remount can hide (but does not destroy) the shared SearchPanel.
    // Reopen the same held session without running Find again, so Replace still
    // carries the pre-refresh incarnation captured above.
    if (!await page.getByTestId("replace-button").isVisible().catch(() => false)) {
        await page.getByTestId("search-toggle-button").click();
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2");
    }
    await page.getByTestId("replace-button").click();
    // Completing the guarded refusal can remount the Grid and hide the shared
    // panel. Reopen the same held session before observing its refusal result.
    if (!await page.getByTestId("replace-status").isVisible().catch(() => false)) {
        await page.getByTestId("search-toggle-button").click();
    }
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
    await expect(placementResult).toHaveCount(1);
    await placementResult.click();
    await page.getByTestId("replace-button").click();
    await expect.poll(async () => {
        state = await snapshotProject(page);
        return state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title;
    }).toBe("Fresh authority only");
});
