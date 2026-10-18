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
        const embedded = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
        await expect(embedded.getByTestId("grid-readonly-reason")).toHaveCount(0);
        await snapshotProject(page);
        // Address the editable cell by its durable record identity. A row
        // text filter stops matching while CellComponent replaces the value
        // button with an input, which would make the editor locator disappear.
        const cell = embedded.getByTestId("yjs-table-grid")
            .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await expect(cell.locator("button.cell-value")).toHaveText("Value from B");
        await cell.locator("button.cell-value").click();
        const embeddedEditor = cell.locator("input.cell-input");
        await expect(embeddedEditor).toBeVisible({ timeout: 30000 });
        await embeddedEditor.fill("Embedded B edit");
        await embeddedEditor.press("Enter");
        await expect(cell.locator("button.cell-value")).toHaveText("Embedded B edit");
        await expect.poll(async () => {
            const after = await snapshotProject(page);
            return {
                a: after.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId]?.title,
                b: after.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title,
            };
        }).toEqual({ a: "Value from A", b: "Embedded B edit" });

        // Actual-source results retain the ordinary selection/copy workflow.
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Embedded B edit");

        const show = page.getByRole("button", { name: "Show sidebar" });
        if (await show.isVisible()) await show.click();
        await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
        await page.getByTestId(`object-row-${gridId}`).locator('[data-testid^="object-open-"]').click();
        const standalone = page.getByTestId("yjs-table-view");
        await expect(standalone.getByTestId("grid-readonly-reason")).toHaveCount(0);
        const standaloneCell = standalone.getByTestId("yjs-table-grid")
            .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await standaloneCell.locator("button.cell-value").click();
        const standaloneEditor = standaloneCell.locator("input.cell-input");
        await expect(standaloneEditor).toBeVisible({ timeout: 30000 });
        await standaloneEditor.fill("Standalone B edit");
        await standaloneEditor.press("Enter");
        await expect(standaloneCell.locator("button.cell-value")).toHaveText("Standalone B edit");
        await expect.poll(async () => {
            const after = await snapshotProject(page);
            return {
                a: after.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId]?.title,
                b: after.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title,
            };
        }).toEqual({ a: "Value from A", b: "Standalone B edit" });
    },
);
