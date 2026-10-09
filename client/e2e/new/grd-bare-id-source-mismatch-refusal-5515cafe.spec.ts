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
    "a mismatched saved Grid refuses ordinary edits on embedded and standalone surfaces",
    async ({ page }, testInfo) => {
        test.setTimeout(240000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        await pointGridAToTableB(page, fixture);

        const gridId = await fixture.gridA.getAttribute("data-grid-id");
        expect(gridId).toBeTruthy();
        // Reload after fixture configuration so a refused edit starts from a
        // clean undo history while retaining the persisted mismatched query.
        await page.reload();
        await expect(fixture.gridA.getByTestId("grid-readonly-reason")).toContainText(
            "not the Grid's source Table",
            { timeout: 30000 },
        );
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
        const before = await snapshotProject(page);
        const cell = fixture.gridA.getByTestId("yjs-table-grid")
            .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await expect(cell.locator("button.cell-value")).toHaveText("Value from B");
        await expect(cell.locator("button.cell-value")).toHaveAttribute("aria-disabled", "true");
        await cell.click();
        await page.keyboard.press("Enter");
        await expect(cell.locator("input.cell-input")).toHaveCount(0);
        expect(await snapshotProject(page)).toEqual(before);
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();

        // Read-only results remain selectable/copyable even though they have no
        // mutation authority.
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Value from B");

        await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/grids/${gridId}`);
        await page.reload();
        const standalone = page.getByTestId("yjs-table-view");
        await expect(standalone.getByTestId("grid-readonly-reason")).toContainText("not the Grid's source Table", {
            timeout: 30000,
        });
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
        const standaloneBefore = await snapshotProject(page);
        const standaloneCell = standalone.getByTestId("yjs-table-grid")
            .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await standaloneCell.click();
        await page.keyboard.press("Enter");
        await expect(standaloneCell.locator("input.cell-input")).toHaveCount(0);
        expect(await snapshotProject(page)).toEqual(standaloneBefore);
        await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
    },
);
