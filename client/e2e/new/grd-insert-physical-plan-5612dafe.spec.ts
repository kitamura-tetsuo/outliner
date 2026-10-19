/** @feature FTR-8f41c2d7 */
import { expect, test } from "../fixtures/grid-render-trace";
import { chooseInsertTarget, prepareInsertPreference, setInsertQuery } from "../utils/gridInsertPreferenceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

for (const restriction of ["generated", "unique", "primary-key"] as const) {
    test(`Add row refuses the applied ${restriction} destination before a record effect`, async ({ page }, info) => {
        test.setTimeout(180000);
        const { grid, ids, state } = await prepareInsertPreference(page, info);
        await page.evaluate(({ id, restriction }) => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            const doc = project.ydoc.getMap("yjsTables").get(id).get("doc");
            const text = doc.getText("schema");
            const fields = restriction === "generated"
                ? "title TEXT DEFAULT 'draft', derived TEXT GENERATED ALWAYS AS (upper(title)) STORED"
                : "title TEXT UNIQUE NOT NULL DEFAULT 'draft'";
            doc.transact(() => {
                text.delete(0, text.length);
                text.insert(
                    0,
                    restriction === "primary-key"
                        ? "CREATE TABLE insert_b (id TEXT, title TEXT PRIMARY KEY DEFAULT 'draft')"
                        : `CREATE TABLE insert_b (id TEXT PRIMARY KEY, ${fields})`,
                );
                if (restriction !== "generated") {
                    // A valid existing source row; the action under test uses controls.
                    const data = doc.getMap("data");
                    const row = new data.constructor();
                    row.set("id", "existing-draft");
                    row.set("title", "draft");
                    data.set("existing-draft", row);
                }
            });
        }, { id: ids.insert_b, restriction });
        // Resolving this SELECT requires the new physical schema to apply.
        await setInsertQuery(
            page,
            grid,
            restriction === "generated"
                ? "SELECT id AS id, derived AS title FROM insert_b"
                : "SELECT id AS id, title AS title FROM insert_b",
        );
        await expect(grid.getByTestId("grid-insert-resolution")).toContainText("automatic: insert_b");
        await expect(grid.getByTestId("yjs-table-query-error")).toHaveCount(0);
        await expect(grid.locator("tbody tr[data-record-id]")).toHaveCount(restriction === "generated" ? 0 : 1);
        if (restriction !== "generated") await expect(grid.locator("tbody")).toContainText("draft");
        await chooseInsertTarget(grid, ids.insert_b);
        const before = await state();
        await page.evaluate(id => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            (globalThis as any).__physicalInsertMutations = 0;
            project.ydoc.getMap("yjsTables").get(id).get("doc").getMap("data").observeDeep(() =>
                (globalThis as any).__physicalInsertMutations++
            );
        }, ids.insert_b);
        await grid.getByTestId("yjs-table-add-row").click();
        await expect(grid.getByTestId("yjs-grid-insert-status")).toHaveText(
            "The Table has no supported default insertion plan",
        );
        expect(await state()).toEqual(before);
        expect(await page.evaluate(() => (globalThis as any).__physicalInsertMutations)).toBe(0);
        await expect(grid.locator("tbody tr[data-record-id]")).toHaveCount(restriction === "generated" ? 0 : 1);
    });
}
