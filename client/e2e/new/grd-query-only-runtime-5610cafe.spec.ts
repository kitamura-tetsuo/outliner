import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5514c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";

const QUERY = "SELECT 42 AS value, true AS flag";

test(
    "a zero-Table query Grid retains rich reading, settings, copy and identity after reload",
    async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Query anchor"]);
        const host = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Query anchor" }),
            "Grid",
        );
        const hostId = await host.getAttribute("data-item-id");
        await host.getByRole("button", { name: "New Query Grid", exact: true }).click();
        await host.getByTestId("yjs-grid-create-query").click();
        const view = host.getByTestId("yjs-table-view");
        const gridId = await view.getAttribute("data-grid-id");
        await view.getByTestId("yjs-table-toggle-ui").click();
        await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(page, QUERY);
        await expect(view.getByTestId("yjs-table-grid").locator('td[data-col="value"]')).toHaveText("42");
        await expect(view.locator('td[data-col="flag"] input[type="checkbox"]')).toBeChecked();
        await view.getByTestId("yjs-table-label-value").fill("Answer");
        await view.getByTestId("yjs-table-label-value").press("Tab");
        await expect(view.getByTestId("yjs-table-grid").locator("th", { hasText: "Answer" })).toBeVisible();
        const state = () =>
            page.evaluate(({ gridId, hostId }) => {
                const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
                const grid = project.ydoc.getMap("yjsGrids").get(gridId);
                const find = (items: any): any => {
                    for (const item of items) {
                        if (item.id === hostId) return item;
                        const nested = find(item.items);
                        if (nested) return nested;
                    }
                };
                const item = find(project.items);
                const value = item.tree.getNodeValueFromKey(item.key);
                return {
                    definition: grid.toJSON(),
                    tableCount: project.ydoc.getMap("yjsTables").size,
                    binding: { gridId: value.get("yjsGridId"), hasTable: value.has("yjsTableId") },
                };
            }, { gridId, hostId });
        const before = await state();
        expect(before.tableCount).toBe(0);
        expect(before.binding).toEqual({ gridId, hasTable: false });
        expect(before.definition.query).toBe(QUERY);
        expect(before.definition).not.toHaveProperty("sourceTableId");
        expect(before.definition).not.toHaveProperty("insertTargetTableId");
        await view.locator('td[data-col="value"]').click();
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("42");
        await view.getByTestId("yjs-table-toggle-chart").click();
        await expect(view.getByTestId("yjs-table-chart").locator("canvas").first()).toBeVisible();
        await page.reload();
        await expect(view.locator('td[data-col="value"]')).toHaveText("42");
        await expect(view.getByTestId("yjs-table-name")).toHaveText("Query Grid");
        await expect(view.getByTestId("grid-query-dependencies")).toHaveText("No project Table dependencies");
        expect(await state()).toEqual(before);
        await expect(view.getByTestId("yjs-table-grid").locator("th", { hasText: "Answer" })).toBeVisible();
    },
);
