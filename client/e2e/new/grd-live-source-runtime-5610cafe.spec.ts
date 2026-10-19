import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5514c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { snapshotProject } from "../utils/gridMutationProvenanceHelpers";
import { prepareTypedGridSources } from "../utils/gridRuntimeHelpers";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";

test(
    "live A/B switching preserves history, B metadata and B-only edit/add/delete on both surfaces",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await prepareTypedGridSources(page, testInfo);
        const queryB = fixture.queryB;
        const gridId = await fixture.gridA.getAttribute("data-grid-id");
        const grid = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
        const cell = grid.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
        await cell.locator("button").click();
        await cell.locator("input").fill("A local edit");
        await cell.locator("input").press("Enter");
        await expect.poll(async () =>
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId]
                ?.title
        ).toBe("A local edit");
        if (!await grid.getByTestId("yjs-table-query-input").isVisible()) {
            await grid.getByTestId("yjs-table-toggle-ui")
                .click();
        }
        await new SqlEditorHelper(grid.getByTestId("yjs-table-query-input")).fillAndCommit(page, queryB);
        await expect(cell.locator("select")).toHaveValue("Value from B");
        await expect(grid.getByTestId("yjs-table-name")).toHaveText("Table A");
        await page.getByTestId("toolbar-undo").click();
        await expect(cell.locator("button")).toHaveText("A local edit");
        await page.getByTestId("toolbar-undo").click();
        await expect(cell.locator("button")).toHaveText("Value from A");
        await page.getByTestId("toolbar-redo").click();
        await expect(cell.locator("button")).toHaveText("A local edit");
        await page.getByTestId("toolbar-redo").click();
        await expect(cell.locator("select")).toHaveValue("Value from B");
        const aBefore = (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)!.data;
        await page.getByTestId("main-toolbar").locator("button:visible:enabled").first().focus();
        await expect(cell.locator("select")).toBeEnabled();
        await cell.locator("select").focus();
        await expect(cell.locator("select")).toBeFocused();
        await cell.locator("select").selectOption("B changed");
        await expect.poll(async () =>
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]
                ?.title
        ).toBe("B changed");
        await grid.getByTestId("yjs-table-add-row").click();
        await expect.poll(async () =>
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)?.dataSize
        ).toBe(2);
        const inserted = Object.keys(
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)!.data,
        ).find(id => id !== fixture.recordId)!;
        await grid.getByRole("button", { name: `Delete row ${inserted}`, exact: true }).click();
        await expect.poll(async () =>
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)?.dataSize
        ).toBe(1);
        await page.getByTestId("toolbar-undo").click();
        await expect.poll(async () =>
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)?.dataSize
        ).toBe(2);
        await page.getByTestId("toolbar-redo").click();
        await expect.poll(async () =>
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)?.dataSize
        ).toBe(1);
        expect((await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)!.data).toEqual(
            aBefore,
        );
        // Enter the standalone route through the production Object Manager link,
        // preserving the live Project and its loaded authoritative Table docs.
        const show = page.getByRole("button", { name: "Show sidebar" });
        if (await show.isVisible()) await show.click();
        await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
        await page.getByTestId(`object-row-${gridId}`).locator('[data-testid^="object-open-"]').click();
        const standalone = page.getByTestId("yjs-table-view");
        await expect(standalone).toHaveAttribute("data-grid-id", gridId!);
        await expect(standalone.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"] select`))
            .toBeEnabled();
        await standalone.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"] select`).focus();
        await standalone.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"] select`).selectOption(
            "Value from B",
        );
        await expect.poll(async () =>
            (await snapshotProject(page)).tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]
                ?.title
        ).toBe("Value from B");
        expect((await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)!.data).toEqual(
            aBefore,
        );
    },
);
