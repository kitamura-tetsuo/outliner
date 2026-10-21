/** @feature FTR-2e6b9f14 */
import { expect, type Page, test } from "@playwright/test";
import { addSourceRecord, createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { chooseInsertTarget } from "../utils/gridInsertPreferenceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { readIndependentViews } from "../utils/sqlOnlyTableDeletionHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

async function openObjects(page: Page) {
    const show = page.getByRole("button", { name: "Show sidebar" });
    if (await show.isVisible().catch(() => false)) await show.click();
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    await expect(page).toHaveURL(/\/objects$/);
}

for (const policy of ["keep-references", "remove-direct-references"]) {
    test(
        `Table deletion ${policy} preserves unrelated and broken views with exact identities`,
        async ({ page }, info) => {
            test.setTimeout(150000);
            await TestHelpers.seedProjectAndNavigate(page, info, ["Anchor", "Neighbour"]);
            await createBlankGrid(page, "Unrelated A", "a");
            await createBlankGrid(page, "Read B", "b");
            await addSourceRecord(page, 1);
            const initial = await readGridProjectState(page);
            const a = initial.tables.find(table => table.sqlName === "a")!;
            const b = initial.tables.find(table => table.sqlName === "b")!;
            const bGrid = initial.grids.find(grid => grid.name === "Read B")!;
            expect(initial.grids.every(grid => !grid.hasPrimaryMetadata)).toBe(true);
            expect(initial.placements.every(placement => !placement.hasPrimaryMetadata)).toBe(true);
            const view = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${bGrid.id}"]`);
            await view.getByTestId("yjs-table-toggle-ui").click();
            await chooseInsertTarget(view, b.id);
            const before = await readIndependentViews(page);
            await openObjects(page);
            await page.getByTestId(`object-open-${a.id}`).click();
            await page.getByRole("button", { name: "Delete table", exact: true }).click();
            await page.getByTestId(`table-delete-${policy}`).click();
            await expect.poll(async () => (await readGridProjectState(page)).tables.map(table => table.id)).toEqual([
                b.id,
            ]);
            expect(await readIndependentViews(page)).toEqual(before);
            expect((await readGridProjectState(page)).tables[0].data).toEqual(b.data);
            await page.locator("aside [data-page-id]").first().click();
            await expect(view.getByTestId("yjs-table-query-error")).toHaveCount(0);
            await expect(view.getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(1);

            await openObjects(page);
            await page.getByTestId(`object-open-${b.id}`).click();
            await page.getByRole("button", { name: "Delete table", exact: true }).click();
            await expect(page.getByRole("dialog", { name: /Delete table/ })).toContainText(
                "Grids reading this table (1)",
            );
            await page.getByTestId(`table-delete-${policy}`).click();
            await expect.poll(async () => (await readGridProjectState(page)).tables.length).toBe(0);
            expect(await readIndependentViews(page)).toEqual(before);
            await page.locator("aside [data-page-id]").first().click();
            await expect(view.getByTestId("yjs-table-query-error")).toBeVisible();
            await expect(view.getByTestId("grid-insert-preference-diagnostic")).toBeVisible();
            expect((await readGridProjectState(page)).grids.find(grid => grid.id === bGrid.id)?.insertTargetTableId)
                .toBe(b.id);
        },
    );
}

test("Table confirmation refreshes unknown SQL evidence after a peer query change", async ({ page }, info) => {
    test.setTimeout(90000);
    await TestHelpers.seedProjectAndNavigate(page, info, ["Anchor", "Neighbour"]);
    await createBlankGrid(page, "Read A", "a");
    const before = await readGridProjectState(page);
    const table = before.tables[0];
    const grid = before.grids[0];
    await openObjects(page);
    await page.getByTestId(`object-open-${table.id}`).click();
    await page.getByRole("button", { name: "Delete table", exact: true }).click();
    await page.evaluate(id => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        project.ydoc.transact(() => project.ydoc.getMap("yjsGrids").get(id).set("query", "SELECT FROM"), "peer");
    }, grid.id);
    await page.getByTestId("table-delete-remove-direct-references").click();
    expect((await readGridProjectState(page)).tables.map(table => table.id)).toEqual([table.id]);
    await expect(page.getByRole("dialog", { name: /Delete table/ })).toContainText(/uncertain|unknown|changed/i);
    await page.getByTestId("table-delete-keep-references").click();
    await expect.poll(async () => (await readGridProjectState(page)).tables.length).toBe(0);
    const after = await readGridProjectState(page);
    expect(after.placements).toEqual(before.placements);
    expect(after.grids[0].id).toBe(grid.id);
    expect(after.grids[0].query).toBe("SELECT FROM");
});
