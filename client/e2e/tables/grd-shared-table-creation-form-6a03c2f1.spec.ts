import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-6a03c2f1
 *  Title   : Shared Table creation form
 *  Source  : docs/client-features/grd-shared-table-creation-form-6a03c2f1.yaml
 */
import { expect, test } from "../fixtures/grid-render-trace";
import { TestHelpers } from "../utils/testHelpers";

async function openGridCreator(page: import("@playwright/test").Page, itemIndex: number) {
    const item = page.locator(".outliner-item[data-item-id]").nth(itemIndex);
    const itemId = await item.getAttribute("data-item-id");
    expect(itemId).toBeTruthy();
    await TestHelpers.setCursor(page, itemId!, 0);
    await TestHelpers.focusGlobalTextarea(page);
    await TestHelpers.waitForCursorVisible(page);
    await page.keyboard.type("/Grid");
    await expect(page.getByTestId("command-item-yjstable")).toBeVisible();
    await page.keyboard.press("Enter");
    const panel = page.getByTestId("yjs-table-create-panel").last();
    await expect(panel).toBeVisible();
    return panel;
}

async function registrySnapshot(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const tables = [...project.ydoc.getMap("yjsTables").entries()].map(([id, value]: any) => ({
            id,
            ...value.toJSON(),
            schema: value.get("doc")?.getText("schema").toString(),
        }));
        const grids = [...project.ydoc.getMap("yjsGrids").entries()].map(([id, value]: any) => ({
            id,
            ...value.toJSON(),
        }));
        const placements = [...(globalThis as any).generalStore.currentPage.items]
            .map((item: any) => ({ id: item.id, gridId: item.yjsGridId }))
            .filter((item: any) => item.gridId);
        return { tables, grids, placements };
    });
}

test.describe("FTR-6a03c2f1: shared Table creation form", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "", "", ""]);
    });

    test("preserves defaults, manual SQL names, presets, mode drafts and registry outcomes", async ({ page }) => {
        const first = await openGridCreator(page, 0);
        await expect(first.getByTestId("yjs-table-preset-select")).toHaveValue("tasks");
        await expect(first.getByTestId("yjs-table-sql-name-input")).toHaveValue("tasks");
        await first.getByTestId("yjs-table-create").click();
        await expect(page.getByTestId("yjs-table-grid").first()).toBeVisible({ timeout: 30000 });

        const second = await openGridCreator(page, 1);
        await second.getByTestId("yjs-table-sql-name-input").fill("manual_habits");
        await second.getByTestId("yjs-table-name-input").fill("Daily habits");
        await second.getByTestId("yjs-table-preset-select").selectOption("habits");
        await second.getByRole("button", { name: "New Grid over Existing Table" }).click();
        await second.getByRole("button", { name: "New Table" }).click();
        await expect(second.getByTestId("yjs-table-sql-name-input")).toHaveValue("manual_habits");
        await second.getByTestId("yjs-table-name-input").press("Enter");
        await expect(page.getByTestId("yjs-table-grid")).toHaveCount(2, { timeout: 30000 });

        const beforeReuse = await registrySnapshot(page);
        expect(beforeReuse.tables).toHaveLength(2);
        expect(beforeReuse.grids).toHaveLength(2);
        expect(beforeReuse.tables.map(table => table.sqlName).sort()).toEqual(["manual_habits", "tasks"]);
        const tasksTable = beforeReuse.tables.find(table => table.sqlName === "tasks")!;
        const tasksGrid = beforeReuse.grids.find(grid => grid.query.includes("FROM tasks"))!;
        expect(tasksTable.schema).toContain("CREATE TABLE tasks");
        expect(tasksGrid.query).toContain("FROM tasks ORDER BY status DESC");
        expect(tasksGrid.components.title.type).toBe("text");
        expect(tasksGrid.components.status.type).toBe("select");
        const habitsGrid = beforeReuse.grids.find(grid => grid.query.includes("FROM manual_habits"))!;
        expect(habitsGrid.query).toContain("FROM manual_habits ORDER BY kind");
        expect(habitsGrid.components.log_date.type).toBe("date");
        expect(beforeReuse.grids.every(grid => !("insertTargetTableId" in grid))).toBe(true);

        const reuse = await openGridCreator(page, 2);
        await reuse.getByTestId("yjs-table-sql-name-input").fill("tasks");
        await reuse.getByTestId("yjs-table-create").click();
        await expect(reuse.getByTestId("yjs-table-create-error")).toContainText("already used");
        expect((await registrySnapshot(page)).tables).toHaveLength(2);
        await reuse.getByRole("button", { name: "New Grid over Existing Table" }).click();
        const habitsTable = beforeReuse.tables.find(table => table.sqlName === "manual_habits");
        expect(habitsTable).toBeDefined();
        await reuse.getByTestId("yjs-table-existing-select").selectOption(habitsTable!.id);
        await reuse.getByTestId("yjs-table-select-existing").click();
        await expect(page.getByTestId("yjs-table-grid")).toHaveCount(3, { timeout: 30000 });

        const place = await openGridCreator(page, 3);
        await place.getByRole("button", { name: "Existing Grid", exact: true }).click();
        await place.getByTestId("yjs-grid-existing-select").selectOption(beforeReuse.grids[0].id);
        await place.getByTestId("yjs-grid-select-existing").click();
        await expect(page.getByTestId("yjs-table-grid")).toHaveCount(4, { timeout: 30000 });

        const afterReuse = await registrySnapshot(page);
        expect(afterReuse.tables).toHaveLength(2);
        expect(afterReuse.grids).toHaveLength(3);
        expect(afterReuse.placements.map(placement => placement.gridId)).toContain(beforeReuse.grids[0].id);
        expect(afterReuse.grids.every(grid => !("insertTargetTableId" in grid))).toBe(true);
    });

    test("refuses invalid names and a Table removed after selection without mutating registries", async ({ page }) => {
        const first = await openGridCreator(page, 0);
        await first.getByTestId("yjs-table-sql-name-input").fill("outline_items");
        await first.getByTestId("yjs-table-create").click();
        await expect(first.getByTestId("yjs-table-create-error")).toContainText("reserved");
        expect((await registrySnapshot(page)).tables).toHaveLength(0);

        await first.getByTestId("yjs-table-sql-name-input").fill("source_table");
        await first.getByTestId("yjs-table-create").click();
        await expect(page.getByTestId("yjs-table-grid")).toHaveCount(1, { timeout: 30000 });
        const created = await registrySnapshot(page);

        const second = await openGridCreator(page, 1);
        await second.getByRole("button", { name: "New Grid over Existing Table" }).click();
        await second.getByTestId("yjs-table-existing-select").selectOption(created.tables[0].id);
        await page.evaluate((tableId) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            project.ydoc.getMap("yjsTables").delete(tableId);
        }, created.tables[0].id);
        const afterDeletion = await registrySnapshot(page);
        await second.getByTestId("yjs-table-select-existing").click();
        await expect(second.getByTestId("yjs-table-source-error")).toContainText("no longer available");

        const refused = await registrySnapshot(page);
        expect(refused).toEqual(afterDeletion);
        expect(refused.tables).toHaveLength(0);
        expect(refused.grids).toHaveLength(1);
    });
});
