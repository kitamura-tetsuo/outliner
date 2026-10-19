/** @feature FTR-8f41c2d7 */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    chooseInsertTarget,
    holdInsert,
    prepareInsertPreference,
    releaseInsert,
    startHeldInsert,
} from "../utils/gridInsertPreferenceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("same-name Table recreation cannot receive a pending insertion", async ({ page }, info) => {
    test.setTimeout(180000);
    const { grid, ids, state } = await prepareInsertPreference(page, info);
    await chooseInsertTarget(grid, ids.insert_b);
    await holdInsert(page, ids.insert_b);
    await startHeldInsert(page, grid);
    const replacementId = await page.evaluate(id => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const registry = project.ydoc.getMap("yjsTables");
        const old = registry.get(id);
        const replacement = new old.constructor();
        const oldDoc = old.get("doc");
        (globalThis as any).__removedInsertTableDoc = oldDoc;
        const newId = crypto.randomUUID();
        const doc = new oldDoc.constructor({ guid: `${project.ydoc.guid}--table--${newId}`, autoLoad: true });
        doc.getText("schema").insert(0, oldDoc.getText("schema").toString());
        replacement.set("doc", doc);
        replacement.set("name", old.get("name"));
        replacement.set("sqlName", old.get("sqlName"));
        project.ydoc.transact(() => {
            registry.delete(id);
            registry.set(newId, replacement);
        });
        return newId;
    }, ids.insert_b);
    await expect(grid.getByTestId("grid-insert-preference-diagnostic")).toContainText(
        /not a row supplier|no longer available/,
    );
    const before = await state();
    expect(before.tables).not.toHaveProperty(ids.insert_b);
    expect(before.tables[replacementId]).toEqual({});
    await releaseInsert(page);
    await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText(/changed|unavailable/);
    expect(await state()).toEqual(before);
    expect(await page.evaluate(() => (globalThis as any).__removedInsertTableDoc.getMap("data").toJSON())).toEqual({});
});

test("unrelated physical record refresh does not freeze a later explicit insertion", async ({ page }, info) => {
    test.setTimeout(180000);
    const { grid, ids, state } = await prepareInsertPreference(page, info);
    await chooseInsertTarget(grid, ids.insert_b);
    await page.evaluate(id => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const data = project.ydoc.getMap("yjsTables").get(id).get("doc").getMap("data");
        const row = new data.constructor();
        row.set("id", "independent-row");
        row.set("title", "An unrelated row");
        data.set("independent-row", row);
    }, ids.insert_c);
    await expect.poll(async () => (await state()).tables[ids.insert_c]["independent-row"]).toEqual({
        id: "independent-row",
        title: "An unrelated row",
    });
    const before = await state();
    await expect(grid.getByTestId("grid-insert-resolution")).toContainText("configured: insert_b");
    await grid.getByTestId("yjs-table-add-row").click();
    await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText("Added row to insert_b");
    const after = await state();
    expect(Object.keys(after.tables[ids.insert_b])).toHaveLength(1);
    expect(after.tables[ids.insert_c]).toEqual(before.tables[ids.insert_c]);
    expect(after.tables[ids.insert_a]).toEqual({});
});
