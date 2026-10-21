/** @feature FTR-5194c2f1 */
import { expect, type Page, test } from "@playwright/test";
import {
    type OverlappingTableFixture,
    pointGridAToTableB,
    seedOverlappingTableFixture,
    snapshotProject,
} from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

async function captureReplace(page: Page, fixture: OverlappingTableFixture, replacement: string) {
    await page.getByTestId("search-toggle-button").click();
    await page.locator("#search-scope").selectOption("page");
    await page.getByTestId("search-input").fill("Value from B");
    await page.getByTestId("replace-input").fill(replacement);
    await page.getByTestId("search-button").click();
    await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2", { timeout: 30000 });
    // Both placements currently read B. Target A explicitly: result order is
    // identity-sorted, so its first hit can belong to the unchanged B Grid.
    const placementId = await fixture.gridA.evaluate(element =>
        element.closest("[data-item-id]")?.getAttribute("data-item-id")
    );
    expect(placementId).toBeTruthy();
    const result = page.locator(`[data-testid="search-result-button"][data-placement-id="${placementId}"]`);
    await expect(result).toHaveCount(1);
    await result.click();
    await page.evaluate(sqlName => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => release = resolve);
        (globalThis as any).__gridRelationGate = { pending: false, consumed: false, release, failure: undefined };
        globalThis.__GRID_RELATION_TEST_CONTROL__ = {
            beforeResolve: async name => {
                const state = (globalThis as any).__gridRelationGate;
                if (name !== sqlName || state.consumed) return;
                state.consumed = true;
                state.pending = true;
                await gate;
                const failure = (globalThis as any).__gridRelationGate.failure;
                if (failure) throw new Error(failure);
            },
        };
    }, fixture.tableB.sqlName);
}

async function startReplace(page: Page) {
    await page.getByTestId("replace-button").click();
    await expect.poll(() => page.evaluate(() => (globalThis as any).__gridRelationGate?.pending)).toBe(true);
    await expect(page.getByTestId("replace-button")).toBeDisabled();
    await expect(page.getByTestId("replace-all-button")).toBeDisabled();
}

async function startReplaceAll(page: Page) {
    await page.getByTestId("replace-all-button").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Replace All" }).click();
    await expect.poll(() => page.evaluate(() => (globalThis as any).__gridRelationGate?.pending)).toBe(true);
    await expect(page.getByTestId("replace-button")).toBeDisabled();
    await expect(page.getByTestId("replace-all-button")).toBeDisabled();
}

async function releaseRelation(page: Page, failure?: string) {
    await page.evaluate(message => {
        (globalThis as any).__gridRelationGate.failure = message;
        (globalThis as any).__gridRelationGate.release();
    }, failure);
}

async function reopenHeldSearchIfHidden(page: Page) {
    if (!await page.getByTestId("replace-button").isVisible().catch(() => false)) {
        await page.getByTestId("search-toggle-button").click();
    }
}

/**
 * Identify the production UndoManager that owns one Grid definition. The
 * router's aggregate depth alone cannot attribute a newly published entry:
 * this records both that Grid scope's Yjs stack and whether it supplied the
 * newest routed operation.
 */
async function gridHistoryEvidence(page: Page, gridId: string) {
    return await page.evaluate(id => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const gridEntry = project.ydoc.getMap("yjsGrids").get(id);
        const router = (globalThis as any).globalUndoRouter;
        const manager = [...router.registered]
            .find((candidate: any) => candidate.scope.includes(gridEntry));
        const newest = router.undoStack.at(-1);
        return {
            totalDepth: router.undoDepth as number,
            gridScopeDepth: manager?.undoStack.length as number | undefined,
            newestIsGridScope: newest === manager,
        };
    }, gridId);
}

async function unchanged(page: Page, fixture: OverlappingTableFixture, undoDepth: number) {
    await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2");
    expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(undoDepth);
    const state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title)
        .toBe("Value from B");
}

test("Replace Current surfaces a relation lookup rejection with no effect", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    await pointGridAToTableB(page, fixture);
    await captureReplace(page, fixture, "must not apply");
    const undoDepth = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);
    await startReplaceAll(page);
    await releaseRelation(page, "injected relation lookup failure");
    await expect(page.getByTestId("replace-status")).toContainText("injected relation lookup failure");
    await unchanged(page, fixture, undoDepth);
});

test("Replace Current revalidates surface permission after relation lookup", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    await pointGridAToTableB(page, fixture);
    await captureReplace(page, fixture, "must not apply");
    const undoDepth = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);
    await startReplace(page);
    await page.evaluate(() => {
        const meta = (globalThis as any).generalStore.project.ydoc.getMap("metadata");
        meta.set("resetStartedAt", Date.now());
        meta.set("isResetting", true);
    });
    await expect(page.getByText("Demo content is being reset")).toBeVisible();
    await releaseRelation(page);
    await expect(page.getByTestId("replace-status")).toContainText("changed or could not be revalidated");
    await unchanged(page, fixture, undoDepth);
});

test("Replace Current refuses a same-field conflict introduced while lookup is pending", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    await pointGridAToTableB(page, fixture);
    await captureReplace(page, fixture, "must not apply");
    await startReplace(page);
    await page.evaluate(({ tableId, recordId }) => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        project.ydoc.getMap("yjsTables").get(tableId).get("doc").getMap("data").get(recordId)
            .set("title", "concurrent value");
    }, { tableId: fixture.tableB.id, recordId: fixture.recordId });
    const undoDepth = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);
    await releaseRelation(page);
    await expect(page.getByTestId("replace-status")).toContainText("changed or could not be revalidated");
    await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2");
    expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(undoDepth);
    const state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title)
        .toBe("concurrent value");
});

test("Replace Current refuses a query change introduced while lookup is pending", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    await pointGridAToTableB(page, fixture);
    await captureReplace(page, fixture, "must not apply");
    await startReplace(page);
    const gridId = await fixture.gridA.getAttribute("data-grid-id");
    expect(gridId).toBeTruthy();
    const historyBeforeQueryChange = await gridHistoryEvidence(page, gridId!);
    expect(historyBeforeQueryChange.gridScopeDepth).toBeDefined();
    const editor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
    await editor.fillAndCommit(page, `SELECT id, title, done FROM ${fixture.tableA.sqlName}`);
    const historyAfterQueryChange = await gridHistoryEvidence(page, gridId!);
    // setGridQuery performs one synchronous Yjs transaction. Attribute the
    // observed increase to that exact Grid definition scope before any query
    // execution, focus transition, or held replacement settlement can be
    // accepted into the refusal baseline.
    expect(historyAfterQueryChange).toEqual({
        totalDepth: historyBeforeQueryChange.totalDepth + 1,
        gridScopeDepth: historyBeforeQueryChange.gridScopeDepth! + 1,
        newestIsGridScope: true,
    });
    await expect(fixture.gridA.getByTestId("yjs-table-grid")).toContainText("Value from A", { timeout: 30000 });
    const undoDepth = historyAfterQueryChange.totalDepth;
    // Separately preserve the intentional query edit's ordinary Undo/Redo
    // semantics after its origin and exact history delta are established.
    await page.evaluate(async () => await (globalThis as any).globalUndoRouter.undo());
    await expect(fixture.gridA.getByTestId("yjs-table-grid")).toContainText("Value from B", { timeout: 30000 });
    expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(undoDepth - 1);
    await page.evaluate(async () => await (globalThis as any).globalUndoRouter.redo());
    await expect(fixture.gridA.getByTestId("yjs-table-grid")).toContainText("Value from A", { timeout: 30000 });
    expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(undoDepth);
    await releaseRelation(page);
    await reopenHeldSearchIfHidden(page);
    await expect(page.getByTestId("replace-status")).toContainText("changed or could not be revalidated");
    // Provider refresh timing may retain the stale alias or remove it after the
    // query switches to A. The authoritative B hit must remain navigable either
    // way, and the refused action must not mutate its source or history.
    await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2");
    await expect(page.getByTestId("search-result-button").filter({ hasText: "Value from B" }).first()).toBeVisible();
    expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(undoDepth);
    const state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title)
        .toBe("Value from B");
});

test("Replace Current refuses a source record replacement while lookup is pending", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    await pointGridAToTableB(page, fixture);
    await captureReplace(page, fixture, "must not apply");
    await startReplace(page);
    await page.evaluate(({ tableId, recordId }) => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const data = project.ydoc.getMap("yjsTables").get(tableId).get("doc").getMap("data");
        const previous = data.get(recordId);
        const replacement = new previous.constructor();
        replacement.set("id", recordId);
        replacement.set("title", "Value from B");
        replacement.set("done", false);
        data.delete(recordId);
        data.set(recordId, replacement);
    }, { tableId: fixture.tableB.id, recordId: fixture.recordId });
    const undoDepth = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);
    await releaseRelation(page);
    await expect(page.getByTestId("replace-status")).toContainText("changed or could not be revalidated");
    await unchanged(page, fixture, undoDepth);
});
