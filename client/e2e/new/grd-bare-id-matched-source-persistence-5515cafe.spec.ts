/** @feature GRD-5515cafe */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import {
    addSourceRecord,
    configureGrid,
    createBlankGrid,
    readGridProjectState,
} from "../utils/crossProjectGridHelpers";
import { seedOverlappingTableFixture, snapshotProject } from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test("a matched saved Grid commits only to its source Table and survives reload", async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    const gridId = await fixture.gridA.getAttribute("data-grid-id");
    expect(gridId).toBeTruthy();

    const queryEditor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
    await queryEditor.fillAndCommit(page, `SELECT id, title AS value, done FROM ${fixture.tableA.sqlName}`);

    const cell = fixture.gridA.getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${fixture.recordId}"][data-col="value"]`);
    await cell.locator("button.cell-value").click();
    const editor = cell.locator("textarea.cell-input");
    await editor.fill("Committed only");
    await editor.press("Alt+Enter");
    await editor.type("to A");
    await expect(editor).toHaveValue("Committed only\nto A");
    await page.keyboard.press("Enter");

    const state = await snapshotProject(page);
    expect(state.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId].title)
        .toBe("Committed only\nto A");
    expect(state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId].title)
        .toBe("Value from B");

    await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/grids/${gridId}`);
    await page.reload();
    const reloadedCell = page.getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${fixture.recordId}"][data-col="value"]`);
    await expect(reloadedCell.locator("button.cell-value")).toHaveText("Committed only\nto A", { timeout: 30000 });

    // Load B through its own Table surface before checking persisted subdoc
    // data; the standalone A Grid intentionally does not connect every sibling
    // Table subdoc merely so a test helper can inspect it.
    await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/tables/${fixture.tableB.id}`);
    const tableBCell = page.getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${fixture.recordId}"][data-col="title"]`);
    await expect(tableBCell.locator("button.cell-value")).toHaveText("Value from B", { timeout: 30000 });
});

test("unchanged native textarea editing preserves a pre-existing canonical CRLF value", async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const fixture = await seedOverlappingTableFixture(page, testInfo);
    const canonical = "legacy\r\noriginal";
    // Seed a previously persisted CRLF record as a fixture. User editing
    // below still uses the actual saved-Grid TextCell and guarded writer.
    await page.evaluate(({ tableId, recordId, text }) => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const data = project.ydoc.getMap("yjsTables").get(tableId).get("doc").getMap("data");
        const row = data.get(recordId);
        if (typeof row?.set === "function") row.set("title", text);
        else data.set(recordId, { ...row, title: text });
    }, { tableId: fixture.tableA.id, recordId: fixture.recordId, text: canonical });
    await expect.poll(async () =>
        (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)
            ?.data[fixture.recordId]?.title
    ).toBe(canonical);
    const before = await snapshotProject(page);

    const cell = fixture.gridA.getByTestId("yjs-table-grid")
        .locator('td[data-record-id="' + fixture.recordId + '"][data-col="title"]');
    await expect(cell.locator("button.cell-value")).toBeVisible({ timeout: 30000 });
    await cell.locator("button.cell-value").click();
    const editor = cell.locator("textarea.cell-input");
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue("legacy\noriginal");
    await editor.press("Enter");
    await expect(cell.locator("textarea.cell-input")).toHaveCount(0);
    await expect.poll(async () =>
        (await snapshotProject(page)).tables.find(table => table.id === fixture.tableA.id)
            ?.data[fixture.recordId]?.title
    ).toBe(canonical);
    expect(await snapshotProject(page)).toEqual(before);
    await cell.locator("button.cell-value").click();
    await expect(cell.locator("textarea.cell-input")).toHaveValue("legacy\noriginal");
    await cell.locator("textarea.cell-input").press("Escape");
    expect(await snapshotProject(page)).toEqual(before);
});

test("a saved same-Table UNION refuses multiline drafts when one branch computes the aliased value",
    async ({ page }, testInfo) => {
        test.setTimeout(240000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        const queryEditor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
        await queryEditor.fillAndCommit(
            page,
            `SELECT '${fixture.tableA.sqlName}' AS source_kind, id AS source_id, title AS value FROM ${fixture.tableA.sqlName} `
                + `UNION ALL SELECT '${fixture.tableA.sqlName}', id, title || '!' FROM ${fixture.tableA.sqlName}`,
        );

        const grid = fixture.gridA.getByTestId("yjs-table-grid");
        await expect(grid.locator("tbody tr")).toHaveCount(2, { timeout: 30000 });
        await expect(grid.getByTestId("grid-readonly-reason")).toHaveCount(0);
        const originalState = await snapshotProject(page);

        // Both results have a verified Table row source, but neither occurrence
        // can be attributed to the physical or computed value branch.
        for (const displayedValue of ["Value from A", "Value from A!"]) {
            const row = grid.locator("tbody tr").filter({
                has: page.locator('td[data-col="value"] button.cell-value').filter({
                    hasText: displayedValue.endsWith("!") ? /^Value from A!$/ : /^Value from A$/,
                }),
            });
            // Keep the occurrence locator stable after editing replaces its button.
            const rowId = await row.locator('td[data-col="value"]').getAttribute("data-row-id");
            expect(rowId).toBeTruthy();
            const cell = grid.locator(`td[data-row-id="${rowId}"][data-col="value"]`);
            await cell.locator("button.cell-value").click();
            const editor = cell.locator("textarea.cell-input");
            await expect(editor).toBeVisible({ timeout: 30000 });
            await editor.fill("selection remains");
            await editor.evaluate(node => (node as HTMLTextAreaElement).setSelectionRange(1, 5));
            await editor.press("Alt+Enter");
            await expect(editor).toHaveValue("selection remains");
            await expect(editor).toBeFocused();
            await expect.poll(() =>
                editor.evaluate(node => [
                    (node as HTMLTextAreaElement).selectionStart,
                    (node as HTMLTextAreaElement).selectionEnd,
                ])
            ).toEqual([1, 5]);
            await expect(cell.getByRole("alert")).toContainText("does not accept line breaks");

            await page.evaluate(() => navigator.clipboard.writeText("one\r\ntwo"));
            await editor.press("Control+V");
            await expect(editor).toHaveValue("selection remains");
            await expect.poll(() =>
                editor.evaluate(node => [
                    (node as HTMLTextAreaElement).selectionStart,
                    (node as HTMLTextAreaElement).selectionEnd,
                ])
            ).toEqual([1, 5]);
            await editor.press("Escape");
            await expect(cell.locator("textarea.cell-input")).toHaveCount(0);
        }
        expect(await snapshotProject(page)).toEqual(originalState);
        expect(originalState.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId].title)
            .toBe("Value from A");
    });

test("a real UUID Table field rendered by TextCell refuses multiline inserts but permits valid single-line edits",
    async ({ page }, testInfo) => {
        test.setTimeout(240000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["UUID provenance anchor"]);
        await createBlankGrid(page, "UUID policy", "uuid_policy");
        const schema = "CREATE TABLE uuid_policy (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  token UUID\n)";
        const query = "SELECT id, title, token FROM uuid_policy";
        await configureGrid(page, 0, schema, query, "Title");
        await addSourceRecord(page);

        const original = await readGridProjectState(page);
        const table = original.tables.find(entry => entry.sqlName === "uuid_policy");
        expect(table).toBeDefined();
        const recordId = Object.keys(table!.data)[0];
        expect(recordId).toBeTruthy();
        const cell = page.getByTestId("yjs-table-grid")
            .locator('td[data-record-id="' + recordId + '"][data-col="token"]');
        await expect(cell.locator("button.cell-value")).toBeVisible({ timeout: 30000 });
        // Count actual Yjs record changes; refusal, cancellation, and blur
        // must never write, and Enter must commit at most once.
        await page.evaluate(tableId => {
            const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
            const data = project.ydoc.getMap("yjsTables").get(tableId).get("doc").getMap("data");
            (globalThis as any).__uuidRecordChanges = 0;
            data.observeDeep(() => {
                (globalThis as any).__uuidRecordChanges++;
            });
        }, table!.id);
        await cell.locator("button.cell-value").click();
        const editor = cell.locator("textarea.cell-input");
        await expect(editor).toBeFocused();
        const validUuid = "11111111-2222-4333-8444-555555555555";
        await editor.fill(validUuid);
        await editor.evaluate(node => (node as HTMLTextAreaElement).setSelectionRange(2, 7));
        await editor.press("Alt+Enter");
        await expect(editor).toHaveValue(validUuid);
        await expect(editor).toBeFocused();
        await expect.poll(() => editor.evaluate(node => [
            (node as HTMLTextAreaElement).selectionStart,
            (node as HTMLTextAreaElement).selectionEnd,
        ])).toEqual([2, 7]);
        await expect(cell.getByRole("alert")).toContainText("does not accept line breaks");

        await page.evaluate(() => navigator.clipboard.writeText("not\r\na-uuid"));
        await editor.press("Control+V");
        await expect(editor).toHaveValue(validUuid);
        await expect.poll(() => editor.evaluate(node => [
            (node as HTMLTextAreaElement).selectionStart,
            (node as HTMLTextAreaElement).selectionEnd,
        ])).toEqual([2, 7]);
        // A refused insertion cannot write any Table field or Grid configuration.
        expect(await readGridProjectState(page)).toEqual(original);
        expect(await page.evaluate(() => (globalThis as any).__uuidRecordChanges)).toBe(0);

        await editor.fill("");
        await editor.fill(validUuid);
        await expect(cell.getByRole("alert")).toHaveCount(0);
        await editor.press("Enter");
        await expect.poll(async () =>
            (await readGridProjectState(page)).tables.find(entry => entry.id === table!.id)
                ?.data[recordId]?.token
        ).toBe(validUuid);
        await expect(cell.locator("button.cell-value")).toHaveText(validUuid);
        const committed = await readGridProjectState(page);
        expect(committed.tables.find(entry => entry.id === table!.id)?.schema).toBe(schema);
        expect(committed.grids.find(entry => entry.query === query)).toBeDefined();
        await expect.poll(() => page.evaluate(() => (globalThis as any).__uuidRecordChanges)).toBe(1);
        // Re-focusing after an Enter/blur pair cannot replay the exited edit.
        await cell.locator("button.cell-value").click();
        const cancelled = cell.locator("textarea.cell-input");
        await cancelled.fill("discarded UUID change");
        await cancelled.press("Escape");
        await expect(cell.locator("textarea.cell-input")).toHaveCount(0);
        await page.getByTestId("yjs-table-grid").locator('td[data-col="title"] button.cell-value').first().click();
        expect(await page.evaluate(() => (globalThis as any).__uuidRecordChanges)).toBe(1);
        expect((await readGridProjectState(page)).tables.find(entry => entry.id === table!.id)?.data[recordId]?.token)
            .toBe(validUuid);
    });
