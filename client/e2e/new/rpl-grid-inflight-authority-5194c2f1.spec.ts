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

async function waitForStableUndoDepth(page: Page): Promise<number> {
    let previous = -1;
    let unchangedSamples = 0;
    await expect.poll(async () => {
        const current = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth as number);
        unchangedSamples = current === previous ? unchangedSamples + 1 : 0;
        previous = current;
        return unchangedSamples;
    }).toBeGreaterThanOrEqual(5);
    return previous;
}

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
    const undoDepthBeforeQueryChange = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);
    const editor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
    await editor.fillAndCommit(page, `SELECT id, title, done FROM ${fixture.tableA.sqlName}`);
    await expect(fixture.gridA.getByTestId("yjs-table-grid")).toContainText("Value from A", { timeout: 30000 });
    // Rendering the new query and publishing its undo entry cross independent
    // reactive boundaries. Establish that the intentional query edit is in
    // history before taking the no-effect baseline for the held replacement.
    const undoDepth = await waitForStableUndoDepth(page);
    expect(undoDepth).toBeGreaterThan(undoDepthBeforeQueryChange);
    await releaseRelation(page);
    await reopenHeldSearchIfHidden(page);
    // Provider refresh timing may retain the stale alias or remove it after the
    // query switches to A. The authoritative B hit must remain navigable either
    // way, and the refused action must not mutate its source or history.
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
