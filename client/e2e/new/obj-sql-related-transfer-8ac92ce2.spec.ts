/** @feature FTR-8ac92ce2 */
import { expect, test } from "@playwright/test";
import {
    addSourceRecord,
    createBlankGrid,
    openProjectPage,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

test("SQL-only related selection and exact-set transfer refuse coincident-name rebinding", async ({ page }, info) => {
    test.setTimeout(150000);
    const fixture = await seedCrossProjectFixture(page, info);
    await openProjectPage(page, fixture, "destination");
    await createBlankGrid(page, "Coincident C", "c");
    await addSourceRecord(page);
    const destinationBefore = await readGridProjectState(page);
    await openProjectPage(page, fixture, "source");
    await createBlankGrid(page, "Unused A", "a");
    await createBlankGrid(page, "Read B", "b");
    await createBlankGrid(page, "Exists C", "c");
    await addSourceRecord(page, 1);
    const source = await readGridProjectState(page);
    const grid = source.grids.find(grid => grid.name === "Unused A")!;
    const a = source.tables.find(table => table.sqlName === "a")!;
    const b = source.tables.find(table => table.sqlName === "b")!;
    const c = source.tables.find(table => table.sqlName === "c")!;
    const view = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${grid.id}"]`);
    await view.getByTestId("yjs-table-toggle-ui").click();
    await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(
        page,
        "SELECT b.id FROM b WHERE EXISTS (SELECT 1 FROM c WHERE c.id = b.id)",
    );
    // Deliberately invalid saved preference is not a SQL read edge.
    await page.evaluate(({ grid, a }) => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        project.ydoc.transact(() => project.ydoc.getMap("yjsGrids").get(grid).set("insertTargetTableId", a), "peer");
    }, { grid: grid.id, a: a.id });
    const show = page.getByRole("button", { name: "Show sidebar" });
    if (await show.isVisible()) await show.click();
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    const checkbox = (id: string) => page.getByTestId(`object-row-${id}`).locator("td.checkbox-col input");
    await checkbox(grid.id).check();
    await page.getByTestId("object-manager-select-related").click();
    await page.getByTestId("object-manager-select-related-dependencies").click();
    await expect(checkbox(b.id)).toBeChecked();
    await expect(checkbox(c.id)).toBeChecked();
    await expect(checkbox(a.id)).not.toBeChecked();
    await expect(page.getByTestId("object-manager-selected-count")).toHaveText("3 selected");
    await checkbox(c.id).uncheck();
    await page.getByTestId("object-manager-duplicate-selected").click();
    const dialog = page.getByTestId("object-manager-duplicate-dialog");
    await dialog.getByTestId("object-manager-duplicate-destination-project").fill(fixture.destinationProject);
    await expect(dialog).toContainText(/INSERT preference/);
    await dialog.getByTestId("object-manager-duplicate-apply").click();
    await expect(page).toHaveURL(/\/objects\?selected=/);
    const destination = await readGridProjectState(page);
    expect(destination.tables.map(table => table.sqlName).sort()).toEqual(["b", "c"]);
    const copied = destination.grids.find(grid => grid.name === "Unused A")!;
    expect(copied.id).not.toBe(grid.id);
    expect(copied.query).toBe("");
    expect(copied.insertTargetTableId).toBeUndefined();
    expect(copied.hasPrimaryMetadata).toBe(false);
    expect(destination.tables.find(table => table.sqlName === "c")!.data).toEqual(destinationBefore.tables[0].data);
    await openProjectPage(page, fixture, "source");
    expect((await readGridProjectState(page)).placements).toEqual(source.placements);
});
