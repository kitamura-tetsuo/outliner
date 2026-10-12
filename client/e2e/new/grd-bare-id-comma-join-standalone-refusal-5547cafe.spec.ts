/** @feature GRD-5515cafe */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { seedOverlappingTableFixture, snapshotProject } from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

test(
    "a comma-joined saved Grid refuses ordinary edits on embedded and standalone surfaces",
    async ({ page }, testInfo) => {
        test.setTimeout(240000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        const gridId = await fixture.gridA.getAttribute("data-grid-id");
        expect(gridId).toBeTruthy();

        // Commit the comma-joined SELECT through the real Query (SELECT)
        // editor. The cross join combines both Tables even though its first
        // source is the Grid's own Table (issue #5547).
        const commaQuery =
            `SELECT a.id, a.title, a.done FROM ${fixture.tableA.sqlName} AS a, ${fixture.tableB.sqlName} AS b`;
        const queryEditor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
        await queryEditor.waitForReady();
        await queryEditor.fillAndCommit(page, commaQuery);
        await expect.poll(async () => {
            const persisted = await snapshotProject(page);
            return persisted.tables.find(table => table.id === fixture.tableA.id)?.ui.query;
        }, { timeout: 30000 }).toBe(commaQuery);

        // Reload so a refused edit starts from a clean undo history while
        // retaining the persisted comma-joined query.
        await page.reload();
        const grid = fixture.gridA.getByTestId("yjs-table-grid");
        await expect(grid.locator("tbody tr").filter({ hasText: "Value from A" })).toBeVisible({
            timeout: 30000,
        });
        await expect(fixture.gridA.getByTestId("grid-readonly-reason")).toContainText(
            /multiple sources|several tables/,
            { timeout: 30000 },
        );
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
        const before = await snapshotProject(page);

        // Ordinary cell editing opens no editor and writes nothing.
        const cell = grid.locator("tbody tr").filter({ hasText: "Value from A" }).locator(
            'td[data-col="title"]',
        );
        await expect(cell.locator("button.cell-value")).toHaveText("Value from A");
        await cell.click();
        await page.keyboard.press("Enter");
        await expect(cell.locator("input.cell-input")).toHaveCount(0);
        expect(await snapshotProject(page)).toEqual(before);

        // Row deletion through the ordinary keyboard command removes nothing.
        const rowHeader = grid.locator("th.row-header").first();
        await rowHeader.click();
        await page.keyboard.press("Delete");
        expect(await snapshotProject(page)).toEqual(before);
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
        // Neither the saved query nor the source binding moved.
        expect((await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)?.ui.query)
            .toBe(commaQuery);

        // The actual standalone surface renders the same saved Grid through
        // GridDetailView: it must refuse the same way with its own handoff.
        await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/grids/${gridId}`);
        await page.reload();
        const standalone = page.getByTestId("yjs-table-view");
        await expect(standalone.locator("tbody tr").filter({ hasText: "Value from A" })).toBeVisible({
            timeout: 30000,
        });
        await expect(standalone.getByTestId("grid-readonly-reason")).toContainText(
            /multiple sources|several tables/,
            { timeout: 30000 },
        );
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
        const standaloneBefore = await snapshotProject(page);
        const standaloneCell = standalone.getByTestId("yjs-table-grid")
            .locator("tbody tr").filter({ hasText: "Value from A" }).locator('td[data-col="title"]');
        await standaloneCell.click();
        await page.keyboard.press("Enter");
        await expect(standaloneCell.locator("input.cell-input")).toHaveCount(0);
        const standaloneRowHeader = standalone.getByTestId("yjs-table-grid").locator("th.row-header").first();
        await standaloneRowHeader.click();
        await page.keyboard.press("Delete");
        expect(await snapshotProject(page)).toEqual(standaloneBefore);
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
        expect(
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)?.ui.query,
        ).toBe(commaQuery);
    },
);
