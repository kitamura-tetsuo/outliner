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
import { TestHelpers } from "../utils/testHelpers";
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

test("peer edit of a SELECT source preserves pending insertion authority", async ({ page, browser }, info) => {
    test.setTimeout(240000);
    const { grid, gridId, ids, state } = await prepareInsertPreference(page, info);
    await page.evaluate(id => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const data = project.ydoc.getMap("yjsTables").get(id).get("doc").getMap("data");
        const row = new data.constructor();
        row.set("id", "existing-a");
        row.set("title", "Before peer edit");
        data.set("existing-a", row);
    }, ids.insert_a);
    await expect(grid.locator("tbody")).toContainText("Before peer edit");
    await chooseInsertTarget(grid, ids.insert_b);
    const context = await browser.newContext({ storageState: TestHelpers.createTestStorageState() as never });
    try {
        const peer = await context.newPage();
        await peer.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            (globalThis as any).__E2E__ = true;
        });
        await peer.goto(page.url(), { waitUntil: "domcontentloaded" });
        await peer.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__);
        await peer.evaluate(async () =>
            await (globalThis as any).__USER_MANAGER__.loginWithEmailPassword("test@example.com", "password")
        );
        const peerGrid = peer.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
        await expect(peerGrid.locator("tbody")).toContainText("Before peer edit", { timeout: 60000 });
        await holdInsert(page, ids.insert_b);
        await startHeldInsert(page, grid);
        await peer.evaluate(id => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            project.ydoc.getMap("yjsTables").get(id).get("doc").getMap("data").get("existing-a").set(
                "title",
                "Retained peer edit",
            );
        }, ids.insert_a);
        await expect(grid.locator("tbody")).toContainText("Retained peer edit");
        const before = await state();
        await releaseInsert(page);
        await expect(grid.getByTestId("yjs-grid-insert-status")).toContainText("Added row to insert_b");
        const after = await state();
        expect(Object.keys(after.tables[ids.insert_b])).toHaveLength(1);
        expect(after.tables[ids.insert_a]).toEqual(before.tables[ids.insert_a]);
        expect(after.tables[ids.insert_a]["existing-a"]).toMatchObject({ title: "Retained peer edit" });
        expect(after.tables[ids.insert_c]).toEqual(before.tables[ids.insert_c]);
        expect(after.undoDepth).toBe(before.undoDepth + 1);
        await page.evaluate(() => (globalThis as any).globalUndoRouter.undo());
        await expect.poll(async () => (await state()).tables[ids.insert_b]).toEqual({});
        expect((await state()).tables[ids.insert_a]).toEqual(before.tables[ids.insert_a]);
    } finally {
        await context.close();
    }
});
