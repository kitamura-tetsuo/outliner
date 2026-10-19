/** @feature FTR-8f41c2d7 */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    chooseInsertTarget,
    prepareInsertPreference,
    setInsertQuery,
    supplierQuery,
} from "../utils/gridInsertPreferenceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("empty UNION preference drafts, physical B defaults, A choice and reload", async ({ page }, info) => {
    test.setTimeout(180000);
    const { grid, ids, state } = await prepareInsertPreference(page, info);
    const before = await state();
    await grid.getByTestId("yjs-table-add-row").click();
    await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText("Choose");
    expect((await state()).tables).toEqual(before.tables);
    await grid.getByTestId("grid-insert-preference-open").click();
    const select = grid.getByTestId("grid-insert-preference-select");
    await expect(select.locator("option")).toHaveCount(3);
    await expect(select.locator(`option[value="${ids.insert_a}"]`)).toContainText(
        `Same display name · insert_a · ${ids.insert_a}`,
    );
    await select.selectOption(ids.insert_b);
    await grid.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await state()).toEqual(before);
    await chooseInsertTarget(grid, ids.insert_b);
    expect((await state()).definition.insertTargetTableId).toBe(ids.insert_b);
    expect((await state()).tables).toEqual(before.tables);
    const savedDepth = (await state()).undoDepth;
    await chooseInsertTarget(grid, ids.insert_b);
    expect((await state()).undoDepth).toBe(savedDepth);
    await grid.getByTestId("yjs-table-add-row").click();
    await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText("Added row to insert_b");
    const inserted = await state();
    expect(inserted.tables[ids.insert_a]).toEqual({});
    expect(Object.values(inserted.tables[ids.insert_b])).toEqual([
        expect.objectContaining({ title: "insert_b", marker: "insert_b-physical", b_only: 7 }),
    ]);
    expect(Object.values(inserted.tables[ids.insert_b])[0]).not.toHaveProperty("a_only");
    await expect(grid.getByTestId("grid-readonly-reason")).toBeVisible();
    await page.reload();
    await expect(grid.getByTestId("grid-insert-resolution")).toContainText("configured: insert_b");
    expect((await state()).tables).toEqual(inserted.tables);
    await chooseInsertTarget(grid, ids.insert_a);
    await grid.getByTestId("yjs-table-add-row").click();
    await expect.poll(async () => Object.keys((await state()).tables[ids.insert_a]).length).toBe(1);
    expect(Object.keys((await state()).tables[ids.insert_b])).toHaveLength(1);
});

test("third supplier, dormant stale preference, invalid draft save, and clear", async ({ page }, info) => {
    test.setTimeout(180000);
    const { grid, ids, state } = await prepareInsertPreference(page, info);
    await setInsertQuery(page, grid, supplierQuery(["insert_a", "insert_b", "insert_c"]));
    await chooseInsertTarget(grid, ids.insert_c);
    await grid.getByTestId("yjs-table-add-row").click();
    await expect.poll(async () => Object.keys((await state()).tables[ids.insert_c]).length).toBe(1);
    await setInsertQuery(page, grid, supplierQuery());
    await expect(grid.getByTestId("grid-insert-preference-diagnostic")).toContainText("not a row supplier");
    const before = await state();
    await grid.getByTestId("yjs-table-add-row").click();
    await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText("not a supplier");
    expect((await state()).tables).toEqual(before.tables);
    await chooseInsertTarget(grid, ids.insert_b);
    await grid.getByTestId("grid-insert-preference-open").click();
    await grid.getByTestId("grid-insert-preference-select").selectOption(ids.insert_b);
    await setInsertQuery(page, grid, supplierQuery(["insert_a"]));
    await expect(grid.getByTestId("grid-insert-resolution")).toContainText("automatic: insert_a");
    const baseline = await state();
    await grid.getByTestId("grid-insert-preference-apply").click();
    await expect(grid.getByTestId("grid-insert-preference-error")).toContainText("current permitted");
    expect(await state()).toEqual(baseline);
    await grid.getByRole("button", { name: "Cancel", exact: true }).click();
    await grid.getByTestId("yjs-table-add-row").click();
    await expect.poll(async () => Object.keys((await state()).tables[ids.insert_a]).length).toBe(1);
    expect(Object.keys((await state()).tables[ids.insert_b])).toHaveLength(0);
    await chooseInsertTarget(grid, "");
    expect((await state()).definition).not.toHaveProperty("insertTargetTableId");
    await expect(grid.getByTestId("grid-insert-preference-diagnostic")).toHaveCount(0);
    const cleared = await state();
    await chooseInsertTarget(grid, "");
    expect(await state()).toEqual(cleared);
});
