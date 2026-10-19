/** @feature FTR-8f41c2d7 */
import { expect, test } from "../fixtures/grid-render-trace";
import { chooseInsertTarget, prepareInsertPreference, setInsertQuery } from "../utils/gridInsertPreferenceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test(
    "EXISTS-only dependencies are excluded and filtered insertion reports physical success once",
    async ({ page }, info) => {
        test.setTimeout(180000);
        const { grid, ids, state } = await prepareInsertPreference(page, info);
        await setInsertQuery(
            page,
            grid,
            "SELECT a.id AS id, a.title AS title FROM insert_a a WHERE EXISTS (SELECT 1 AS present FROM insert_b)",
        );
        await expect(grid.getByTestId("grid-insert-resolution")).toContainText("automatic: insert_a");
        await grid.getByTestId("grid-insert-preference-open").click();
        await expect(grid.getByTestId("grid-insert-preference-select").locator("option")).toHaveCount(2);
        await expect(grid.getByTestId("grid-insert-preference-select").locator(`option[value="${ids.insert_b}"]`))
            .toHaveCount(0);
        await grid.getByRole("button", { name: "Cancel", exact: true }).click();
        await grid.getByTestId("yjs-table-add-row").click();
        await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText("outside the displayed result");
        const after = await state();
        expect(Object.keys(after.tables[ids.insert_a])).toHaveLength(1);
        expect(after.tables[ids.insert_b]).toEqual({});
        expect(after.definition).not.toHaveProperty("insertTargetTableId");
        await expect(grid.locator("tbody tr[data-record-id]")).toHaveCount(0);
        expect((await state()).tables).toEqual(after.tables);
    },
);

test(
    "unsupported query and physical NULL default refuse without record or insertion history",
    async ({ page }, info) => {
        test.setTimeout(180000);
        const { grid, ids, state } = await prepareInsertPreference(page, info);
        await chooseInsertTarget(grid, ids.insert_b);
        await setInsertQuery(page, grid, "SELECT count(*) AS total FROM insert_b");
        await expect(grid.getByTestId("grid-insert-resolution")).toContainText(/unsupported|aggregate/i);
        const before = await state();
        await grid.getByTestId("yjs-table-add-row").click();
        await expect(grid.getByTestId("yjs-grid-insert-status")).not.toContainText("Added row");
        expect((await state()).tables).toEqual(before.tables);
        await page.evaluate(id => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            const text = project.ydoc.getMap("yjsTables").get(id).get("doc").getText("schema");
            text.delete(0, text.length);
            text.insert(0, "CREATE TABLE insert_b (id TEXT PRIMARY KEY, title VARCHAR(12) NOT NULL DEFAULT NULL)");
        }, ids.insert_b);
        await setInsertQuery(page, grid, "SELECT id AS id, title AS title FROM insert_b LIMIT 0");
        await expect(grid.getByTestId("grid-insert-resolution")).toContainText("automatic: insert_b");
        const baseline = await state();
        await grid.getByTestId("yjs-table-add-row").click();
        await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText("no supported default");
        expect(await state()).toEqual(baseline);
    },
);
