import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-6a03c2f1 */
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
import { TestHelpers } from "../utils/testHelpers";

async function slashGrid(page: Page, itemIndex: number) {
    const item = page.locator(".outliner-item[data-item-id]").nth(itemIndex);
    const id = await item.getAttribute("data-item-id");
    expect(id).toBeTruthy();
    await TestHelpers.setCursor(page, id!, 0);
    await TestHelpers.focusGlobalTextarea(page);
    await TestHelpers.waitForCursorVisible(page);
    await page.keyboard.type("/Grid");
    await expect(page.getByTestId("command-item-yjstable")).toBeVisible();
    await page.keyboard.press("Enter");
    const panel = page.getByTestId("yjs-table-create-panel").last();
    await expect(panel).toBeVisible();
    return panel;
}

const snapshot = (page: Page) =>
    page.evaluate(() => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const tables = [...project.ydoc.getMap("yjsTables").entries()].map(([id, entry]: any) => {
            const table = entry.toJSON();
            return {
                id,
                name: table.name,
                sqlName: table.sqlName,
                schema: entry.get("doc").getText("schema").toString(),
                data: entry.get("doc").getMap("data").toJSON(),
            };
        });
        const grids = [...project.ydoc.getMap("yjsGrids").entries()].map(([id, entry]: any) => ({
            id,
            ...entry.toJSON(),
        }));
        return { tables, grids };
    });

async function createBlank(page: Page, itemIndex: number, name: string, sqlName: string) {
    const before = await snapshot(page);
    const panel = await slashGrid(page, itemIndex);
    await panel.getByTestId("yjs-table-preset-select").selectOption("blank");
    await panel.getByTestId("yjs-table-name-input").fill(name);
    await panel.getByTestId("yjs-table-sql-name-input").fill(sqlName);
    await panel.getByTestId("yjs-table-create").click();
    await expect(page.getByTestId("yjs-table-grid")).toHaveCount(itemIndex + 1, { timeout: 30000 });
    const after = await snapshot(page);
    const added = after.grids.filter(grid => !before.grids.some(existing => existing.id === grid.id));
    expect(added).toHaveLength(1);
    return added[0].id;
}

async function addNamedRow(page: Page, gridId: string, value: string) {
    const view = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
    await expect(view).toHaveCount(1);
    await view.getByTestId("yjs-table-add-row").click();
    const title = view.getByTestId("yjs-table-grid").locator('td[data-col="title"]').first();
    await title.locator("button.cell-value").click();
    await title.locator("input.cell-input").fill(value);
    await title.locator("input.cell-input").press("Enter");
    await expect(title.locator("button.cell-value")).toHaveText(value, { timeout: 30000 });
}

test("slash-created Grid queries and renders the selected non-first Table", async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "", ""]);
    const firstGridId = await createBlank(page, 0, "First", "first_table");
    await addNamedRow(page, firstGridId, "FIRST ROW");
    const chosenGridId = await createBlank(page, 1, "Chosen", "chosen_table");
    await addNamedRow(page, chosenGridId, "CHOSEN ROW");
    const before = await snapshot(page);
    const chosenTable = before.tables.find(table => table.sqlName === "chosen_table")!;

    const panel = await slashGrid(page, 2);
    await panel.getByRole("button", { name: "New Grid over Existing Table" }).click();
    await panel.getByTestId("yjs-table-existing-select").selectOption(chosenTable.id);
    await panel.getByTestId("yjs-table-select-existing").click();
    await expect(page.getByTestId("yjs-table-grid")).toHaveCount(3, { timeout: 30000 });

    const after = await snapshot(page);
    const added = after.grids.filter(grid => !before.grids.some(existing => existing.id === grid.id));
    expect(added).toHaveLength(1);
    expect(added[0]).not.toHaveProperty("sourceTableId");
    expect(added[0].query).toBe("SELECT * FROM chosen_table");
    expect(after.tables).toEqual(before.tables);
    expect(after.grids.filter(grid => before.grids.some(existing => existing.id === grid.id))).toEqual(before.grids);
    const rendered = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${added[0].id}"]`);
    await expect(rendered).toContainText("CHOSEN ROW");
    await expect(rendered).not.toContainText("FIRST ROW");
});
