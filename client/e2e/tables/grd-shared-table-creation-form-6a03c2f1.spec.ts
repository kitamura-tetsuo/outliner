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
    await page.locator(".outliner-item[data-item-id]").nth(itemIndex).click();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    const panel = page.getByTestId("yjs-table-create-panel").last();
    await expect(panel).toBeVisible();
    return panel;
}

async function registrySnapshot(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const read = (key: string) =>
            [...project.ydoc.getMap(key).entries()].map(([id, value]: any) => ({
                id,
                ...value.toJSON(),
            }));
        return { tables: read("yjsTables"), grids: read("yjsGrids") };
    });
}

test.describe("FTR-6a03c2f1: shared Table creation form", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Default", "Alternative", "Reuse", "Place"]);
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
        expect(afterReuse.grids.every(grid => !("insertTargetTableId" in grid))).toBe(true);
    });

    test("refuses invalid names and a Grid removed after selection without mutating registries", async ({ page }) => {
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
        await second.getByRole("button", { name: "Existing Grid", exact: true }).click();
        await second.getByTestId("yjs-grid-existing-select").selectOption(created.grids[0].id);
        await page.evaluate((gridId) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            project.ydoc.getMap("yjsGrids").delete(gridId);
        }, created.grids[0].id);
        await second.getByTestId("yjs-grid-select-existing").click();
        await expect(second.getByTestId("yjs-table-source-error")).toContainText("no longer available");

        const refused = await registrySnapshot(page);
        expect(refused.tables).toHaveLength(1);
        expect(refused.grids).toHaveLength(0);
    });
});
