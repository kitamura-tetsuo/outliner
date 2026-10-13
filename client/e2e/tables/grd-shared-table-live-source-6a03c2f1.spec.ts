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

const registries = (page: Page) =>
    page.evaluate(() => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const read = (key: string) =>
            [...project.ydoc.getMap(key).entries()].map(([id, entry]: any) => ({ id, ...entry.toJSON() }));
        return { tables: read("yjsTables"), grids: read("yjsGrids") };
    });

async function createBlank(page: Page, itemIndex: number, name: string, sqlName: string) {
    const panel = await slashGrid(page, itemIndex);
    await panel.getByTestId("yjs-table-preset-select").selectOption("blank");
    await panel.getByTestId("yjs-table-name-input").fill(name);
    await panel.getByTestId("yjs-table-sql-name-input").fill(sqlName);
    await panel.getByTestId("yjs-table-create").click();
    await expect(page.getByTestId("yjs-table-grid")).toHaveCount(itemIndex + 1, { timeout: 30000 });
}

test.describe("FTR-6a03c2f1: live source revalidation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "", ""]);
    });

    test("refuses a selected Table whose current SQL name changed or is unsuitable", async ({ page }) => {
        await createBlank(page, 0, "Source", "source_table");
        const initial = await registries(page);
        const panel = await slashGrid(page, 1);
        await panel.getByRole("button", { name: "New Grid over Existing Table" }).click();
        await panel.getByTestId("yjs-table-existing-select").selectOption(initial.tables[0].id);

        await page.evaluate(({ tableId }) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            project.ydoc.getMap("yjsTables").get(tableId).set("sqlName", "archived_tasks");
        }, { tableId: initial.tables[0].id });
        const changed = await registries(page);
        await panel.getByTestId("yjs-table-select-existing").click();
        await expect(panel.getByTestId("yjs-table-source-error")).toContainText("changed after selection");
        expect(await registries(page)).toEqual(changed);

        await panel.getByRole("button", { name: "New Table" }).click();
        await panel.getByRole("button", { name: "New Grid over Existing Table" }).click();
        await page.evaluate(({ tableId }) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            project.ydoc.getMap("yjsTables").get(tableId).set("sqlName", "order");
        }, { tableId: initial.tables[0].id });
        const reserved = await registries(page);
        await panel.getByRole("button", { name: "New Table" }).click();
        await panel.getByRole("button", { name: "New Grid over Existing Table" }).click();
        await panel.getByTestId("yjs-table-select-existing").click();
        await expect(panel.getByTestId("yjs-table-source-error")).toContainText("reserved SQL word");
        expect(await registries(page)).toEqual(reserved);
    });

    test("refuses an existing Grid whose live source Table changed", async ({ page }) => {
        await createBlank(page, 0, "One", "one");
        await createBlank(page, 1, "Two", "two");
        const initial = await registries(page);
        const panel = await slashGrid(page, 2);
        await panel.getByRole("button", { name: "Existing Grid", exact: true }).click();
        await panel.getByTestId("yjs-grid-existing-select").selectOption(initial.grids[0].id);
        await page.evaluate(({ gridId, tableId }) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            project.ydoc.getMap("yjsGrids").get(gridId).set("sourceTableId", tableId);
        }, { gridId: initial.grids[0].id, tableId: initial.tables[1].id });
        const rebound = await registries(page);
        await panel.getByTestId("yjs-grid-select-existing").click();
        await expect(panel.getByTestId("yjs-table-source-error")).toContainText("changed after selection");
        expect(await registries(page)).toEqual(rebound);
    });
});
