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

async function openSearch(page: import("@playwright/test").Page, query: string, replacement: string) {
    await page.getByTestId("search-toggle-button").click();
    await page.locator("#search-scope").selectOption("page");
    await page.getByTestId("search-input").fill(query);
    await page.getByTestId("replace-input").fill(replacement);
    await page.getByTestId("search-button").click();
}

async function confirmReplaceAll(page: import("@playwright/test").Page) {
    await page.getByTestId("replace-all-button").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Replace All" }).click();
}

test(
    "Replace Current follows Project SELECT provenance instead of an overlapping bare id",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        await pointGridAToTableB(page, fixture);

        await openSearch(page, "Value from B", "Replaced in B");
        // Both rendered Grids now project the same physical B record. The two
        // logical placements must remain discoverable even though either one
        // addresses the same guarded source cell.
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2", { timeout: 30000 });
        await page.getByTestId("search-result-button").first().click();
        await page.getByTestId("replace-button").click();

        await expect.poll(async () => {
            const state = await snapshotProject(page);
            return {
                a: state.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId]?.title,
                b: state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title,
            };
        }, { timeout: 30000 }).toEqual({ a: "Value from A", b: "Replaced in B" });
    },
);

test(
    "Replace All deduplicates duplicate placements and keeps one ordinary Undo/Redo step",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        await pointGridAToTableB(page, fixture);
        const undoBefore = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);

        await openSearch(page, "Value from B", "Settled once");
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2", { timeout: 30000 });
        await confirmReplaceAll(page);

        // Both logical placements disappear from the held Find session, while
        // the shared physical source cell contributes exactly one history step.
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 0", { timeout: 30000 });
        await expect.poll(async () => {
            const state = await snapshotProject(page);
            return state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title;
        }).toBe("Settled once");
        await expect.poll(
            () => page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth),
        ).toBe(undoBefore + 1);

        await page.getByRole("button", { name: "Undo" }).click();
        await expect.poll(async () => {
            const state = await snapshotProject(page);
            return state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title;
        }).toBe("Value from B");
        await page.getByRole("button", { name: "Redo" }).click();
        await expect.poll(async () => {
            const state = await snapshotProject(page);
            return state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title;
        }).toBe("Settled once");
    },
);

test(
    "Selection scope replaces only the selected production Grid cell",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        await pointGridAToTableB(page, fixture);
        const selectedCell = fixture.gridA.getByTestId("yjs-table-grid")
            .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await selectedCell.click();
        const otherGrid = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-sql-name").filter({ hasText: new RegExp(`^${fixture.tableB.sqlName}$`) }),
        }).getByTestId("yjs-table-grid");
        await otherGrid.locator(`td[data-record-id="${fixture.recordId}"][data-col="done"]`).click();

        await openSearch(page, "Value from B", "Selected only");
        await page.locator("#search-scope").selectOption("selection");
        await page.getByTestId("search-button").click();
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 1", { timeout: 30000 });
        await confirmReplaceAll(page);

        await expect.poll(async () => {
            const state = await snapshotProject(page);
            return {
                a: state.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId]?.title,
                b: state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title,
            };
        }).toEqual({ a: "Value from A", b: "Selected only" });
    },
);

test(
    "typed-invalid and computed replacements refuse without source mutation or history",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        await pointGridAToTableB(page, fixture);
        const sourceGrid = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-sql-name").filter({ hasText: new RegExp(`^${fixture.tableB.sqlName}$`) }),
        }).getByTestId("yjs-table-grid");
        const doneCell = sourceGrid.locator(`td[data-record-id="${fixture.recordId}"][data-col="done"]`);
        await doneCell.locator('input[type="checkbox"]').check();
        await expect.poll(async () => {
            const state = await snapshotProject(page);
            return state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.done;
        }).toBe(true);
        const historyAfterSeed = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);

        await openSearch(page, "true", "not-a-boolean");
        await page.getByTestId("search-result-button").filter({ hasText: "done: true" }).first().click();
        await page.getByTestId("replace-button").click();
        await expect(page.getByTestId("replace-status")).toContainText("isn't a valid value");
        expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(historyAfterSeed);
        let state = await snapshotProject(page);
        expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.done).toBe(true);

        await page.getByTestId("search-panel").getByRole("button", { name: "Close Search Panel" }).click();
        const titleCell = sourceGrid.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await titleCell.locator("button.cell-value").click();
        await titleCell.locator("input.cell-input").fill("true title");
        await titleCell.locator("input.cell-input").press("Enter");
        await openSearch(page, "true", "settled");
        await confirmReplaceAll(page);
        await expect(page.getByTestId("replace-status")).toHaveText(
            "1 Grid cell replaced; 1 left unchanged (1 not convertible for their column).",
        );
        await expect.poll(async () => {
            const current = await snapshotProject(page);
            const record = current.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId];
            return { title: record?.title, done: record?.done };
        }).toEqual({ title: "settled title", done: true });
        await page.getByTestId("search-panel").getByRole("button", { name: "Close Search Panel" }).click();
        const query = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
        await query.fillAndCommit(
            page,
            `SELECT id, title, done, title || ' computed' AS summary FROM ${fixture.tableB.sqlName}`,
        );
        const projectedGrid = fixture.gridA.getByTestId("yjs-table-grid");
        await expect(projectedGrid.locator('td[data-col="summary"]')).toContainText("settled title computed", {
            timeout: 30000,
        });
        const historyBeforeComputedRefusal = await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth);

        await openSearch(page, "computed", "changed");
        await expect(page.getByTestId("search-replaceable-hint")).toHaveText("0 replaceable");
        await page.getByTestId("search-result-button").click();
        await page.getByTestId("replace-button").click();
        await expect(page.getByTestId("replace-status")).toContainText("read-only");
        expect(await page.evaluate(() => (globalThis as any).globalUndoRouter.undoDepth)).toBe(
            historyBeforeComputedRefusal,
        );
        state = await snapshotProject(page);
        expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title).toBe(
            "settled title",
        );
    },
);
