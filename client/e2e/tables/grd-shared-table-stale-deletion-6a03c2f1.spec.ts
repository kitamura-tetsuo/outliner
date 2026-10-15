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
    return page.getByTestId("yjs-table-create-panel").last();
}

const snapshot = (page: Page) =>
    page.evaluate(() => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const read = (key: string) =>
            [...project.ydoc.getMap(key).entries()].map(([id, entry]: any) => {
                const definition = entry.toJSON();
                // The Table subdoc is a live Y.Doc whose observer internals
                // change when a Grid mounts. Compare its authoritative data
                // separately instead of snapshotting the runtime object.
                delete definition.doc;
                return {
                    id,
                    ...definition,
                    data: key === "yjsTables" ? entry.get("doc").getMap("data").toJSON() : undefined,
                };
            });
        const placements = [...(globalThis as any).generalStore.currentPage.items].map((item: any) => ({
            id: item.id,
            gridId: item.yjsGridId ?? null,
        }));
        return { tables: read("yjsTables"), grids: read("yjsGrids"), placements };
    });

async function createSources(page: Page) {
    for (const [index, sqlName] of ["first_table", "selected_table"].entries()) {
        const panel = await slashGrid(page, index);
        await expect(panel).toBeVisible();
        await panel.getByTestId("yjs-table-preset-select").selectOption("blank");
        await panel.getByTestId("yjs-table-sql-name-input").fill(sqlName);
        await panel.getByTestId("yjs-table-create").click();
        await expect(page.getByTestId("yjs-table-grid")).toHaveCount(index + 1, { timeout: 30000 });
    }
    return snapshot(page);
}

async function expectRefused(page: Page, panel: Awaited<ReturnType<typeof slashGrid>>, before: unknown) {
    await expect(panel.getByTestId("yjs-table-source-error")).toContainText("no longer available");
    expect(await snapshot(page)).toEqual(before);
}

test.describe("FTR-6a03c2f1: deleted selected sources", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "", ""]);
    });

    test("does not substitute another Table when the selected Table is deleted", async ({ page }) => {
        const initial = await createSources(page);
        const panel = await slashGrid(page, 2);
        await panel.getByRole("button", { name: "New Grid over Existing Table" }).click();
        await panel.getByTestId("yjs-table-existing-select").selectOption(initial.tables[1].id);
        await page.evaluate(id =>
            (globalThis as any).__YJS_STORE__.yjsClient.getProject()
                .ydoc.getMap("yjsTables").delete(id), initial.tables[1].id);
        const afterDeletion = await snapshot(page);
        await panel.getByTestId("yjs-table-select-existing").click();
        await expectRefused(page, panel, afterDeletion);
        expect(afterDeletion.tables.map(table => table.id)).toEqual([initial.tables[0].id]);
    });

    test("does not substitute another Grid when the selected Grid is deleted", async ({ page }) => {
        const initial = await createSources(page);
        const panel = await slashGrid(page, 2);
        await panel.getByRole("button", { name: "Existing Grid", exact: true }).click();
        await panel.getByTestId("yjs-grid-existing-select").selectOption(initial.grids[1].id);
        await page.evaluate(id =>
            (globalThis as any).__YJS_STORE__.yjsClient.getProject()
                .ydoc.getMap("yjsGrids").delete(id), initial.grids[1].id);
        const afterDeletion = await snapshot(page);
        await panel.getByTestId("yjs-grid-select-existing").click();
        await expectRefused(page, panel, afterDeletion);
        expect(afterDeletion.grids.map(grid => grid.id)).toEqual([initial.grids[0].id]);
    });

    test("places a Grid whose legacy source Table was deleted", async ({ page }) => {
        const initial = await createSources(page);
        const panel = await slashGrid(page, 2);
        await panel.getByRole("button", { name: "Existing Grid", exact: true }).click();
        await panel.getByTestId("yjs-grid-existing-select").selectOption(initial.grids[1].id);
        await page.evaluate(id =>
            (globalThis as any).__YJS_STORE__.yjsClient.getProject()
                .ydoc.getMap("yjsTables").delete(id), initial.tables[1].id);
        const afterDeletion = await snapshot(page);
        await panel.getByTestId("yjs-grid-select-existing").click();
        await expect(panel).toBeHidden();
        const placed = await snapshot(page);
        expect(placed.tables).toEqual(afterDeletion.tables);
        expect(placed.grids).toEqual(afterDeletion.grids);
        expect(placed.placements[2]?.gridId).toBe(initial.grids[1].id);
    });
});
