/** @feature FTR-8f41c2d7 */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    chooseInsertTarget,
    holdInsert,
    prepareInsertPreference,
    releaseInsert,
    setInsertQuery,
    startHeldInsert,
    supplierQuery,
} from "../utils/gridInsertPreferenceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

for (const change of ["target", "query-ABA", "schema", "permission"] as const) {
    test(`pending Add row refuses a real ${change} change`, async ({ page }, info) => {
        test.setTimeout(180000);
        const { grid, ids, state } = await prepareInsertPreference(page, info);
        await chooseInsertTarget(grid, ids.insert_b);
        await holdInsert(page, ids.insert_b);
        await startHeldInsert(page, grid);
        if (change === "target") await chooseInsertTarget(grid, ids.insert_a);
        if (change === "query-ABA") {
            await setInsertQuery(page, grid, supplierQuery(["insert_a"]));
            await expect(grid.getByTestId("grid-insert-resolution")).toContainText("automatic: insert_a");
            await setInsertQuery(page, grid, supplierQuery());
            await expect(grid.getByTestId("grid-insert-resolution")).toContainText("configured: insert_b");
        }
        if (change === "schema") {
            await page.evaluate(id => {
                const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
                const schema = project.ydoc.getMap("yjsTables").get(id).get("doc").getText("schema");
                schema.insert(schema.length, " ");
            }, ids.insert_b);
        }
        if (change === "permission") {
            await page.evaluate(() => {
                const metadata = (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc.getMap("metadata");
                metadata.set("resetStartedAt", Date.now());
                metadata.set("isResetting", true);
            });
            await expect(page.getByText("Demo content is being reset")).toBeVisible();
        }
        const before = await state();
        await releaseInsert(page);
        await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText(/changed|unavailable|permission/);
        expect((await state()).tables).toEqual(before.tables);
        expect((await state()).undoDepth).toBe(before.undoDepth);
    });
}

test(
    "duplicate activation is disabled, successful intent is consumed, later explicit action is distinct",
    async ({ page }, info) => {
        test.setTimeout(180000);
        const { grid, ids, state } = await prepareInsertPreference(page, info);
        await chooseInsertTarget(grid, ids.insert_b);
        await holdInsert(page, ids.insert_b);
        await startHeldInsert(page, grid);
        // Ordinary keyboard activation cannot activate a disabled pending button.
        await page.keyboard.press("Enter");
        expect(Object.keys((await state()).tables[ids.insert_b])).toHaveLength(0);
        await releaseInsert(page);
        await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText("Added row to insert_b");
        expect(Object.keys((await state()).tables[ids.insert_b])).toHaveLength(1);
        await page.reload();
        await expect(grid.getByTestId("grid-insert-resolution")).toContainText("configured: insert_b");
        expect(Object.keys((await state()).tables[ids.insert_b])).toHaveLength(1);
        await grid.getByTestId("yjs-table-add-row").click();
        await expect.poll(async () => Object.keys((await state()).tables[ids.insert_b]).length).toBe(2);
        expect((await state()).tables[ids.insert_a]).toEqual({});
    },
);

test("reload at the observed pre-effect hold never replays; a fresh action still works", async ({ page }, info) => {
    test.setTimeout(180000);
    const { grid, ids, state } = await prepareInsertPreference(page, info);
    await chooseInsertTarget(grid, ids.insert_b);
    await holdInsert(page, ids.insert_b);
    await startHeldInsert(page, grid);
    const before = (await state()).tables;
    await page.reload();
    await expect(grid.getByTestId("grid-insert-resolution")).toContainText("configured: insert_b");
    expect((await state()).tables).toEqual(before);
    await expect(grid.getByTestId("yjs-table-add-row")).toBeEnabled();
    expect((await state()).tables).toEqual(before);
    await grid.getByTestId("yjs-table-add-row").click();
    await expect.poll(async () => Object.keys((await state()).tables[ids.insert_b]).length).toBe(1);
});

test("preparation failure leaves no effects or automatic retry and permits a fresh action", async ({ page }, info) => {
    test.setTimeout(180000);
    const { grid, ids, state } = await prepareInsertPreference(page, info);
    await chooseInsertTarget(grid, ids.insert_b);
    await holdInsert(page, ids.insert_b);
    await startHeldInsert(page, grid);
    const before = await state();
    await releaseInsert(page, "controlled acquisition failure");
    await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText("controlled acquisition failure");
    expect(await state()).toEqual(before);
    await grid.getByTestId("yjs-table-add-row").click();
    await expect.poll(async () => Object.keys((await state()).tables[ids.insert_b]).length).toBe(1);
});
