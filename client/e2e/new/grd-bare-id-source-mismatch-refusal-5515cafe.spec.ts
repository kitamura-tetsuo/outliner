/** @feature GRD-5515cafe */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import {
    pointGridAToTableB,
    seedOverlappingTableFixture,
    snapshotProject,
} from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test(
    "a saved Grid writes its verified actual source on embedded and standalone surfaces",
    async ({ page }, testInfo) => {
        test.setTimeout(240000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        await pointGridAToTableB(page, fixture);

        const gridId = await fixture.gridA.getAttribute("data-grid-id");
        expect(gridId).toBeTruthy();
        // Reload after fixture configuration so the command starts from a
        // clean history while retaining the persisted cross-Table query.
        await page.reload();
        await expect(fixture.gridA.getByTestId("grid-readonly-reason")).toHaveCount(0);
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
        const before = await snapshotProject(page);
        const cell = fixture.gridA.getByTestId("yjs-table-grid")
            .locator("tbody tr").filter({ hasText: "Value from B" }).locator('td[data-col="title"]');
        await expect(cell.locator("button.cell-value")).toHaveText("Value from B");
        await cell.locator("button.cell-value").click();
        const embeddedEditor = cell.locator("input.cell-input");
        await expect(embeddedEditor).toBeVisible({ timeout: 30000 });
        await embeddedEditor.fill("Embedded B edit");
        await embeddedEditor.press("Enter");
        await expect(cell.locator("button.cell-value")).toHaveText("Embedded B edit");
        let after = await snapshotProject(page);
        expect(after.tables.find(table => table.id === fixture.tableA.id)?.data).toEqual(
            before.tables.find(table => table.id === fixture.tableA.id)?.data,
        );
        expect(after.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title)
            .toBe("Embedded B edit");

        // Actual-source results retain the ordinary selection/copy workflow.
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Embedded B edit");

        await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/grids/${gridId}`);
        await page.reload();
        const standalone = page.getByTestId("yjs-table-view");
        await expect(standalone.getByTestId("grid-readonly-reason")).toHaveCount(0);
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
        const standaloneCell = standalone.getByTestId("yjs-table-grid")
            .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await standaloneCell.locator("button.cell-value").click();
        const standaloneEditor = standaloneCell.locator("input.cell-input");
        await expect(standaloneEditor).toBeVisible({ timeout: 30000 });
        await standaloneEditor.fill("Standalone B edit");
        await standaloneEditor.press("Enter");
        await expect(standaloneCell.locator("button.cell-value")).toHaveText("Standalone B edit");
        after = await snapshotProject(page);
        expect(after.tables.find(table => table.id === fixture.tableA.id)?.data).toEqual(
            before.tables.find(table => table.id === fixture.tableA.id)?.data,
        );
        expect(after.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title)
            .toBe("Standalone B edit");
    },
);
