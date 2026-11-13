/** @feature GRD-2f86c1a9 */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { seedOverlappingTableFixture, snapshotProject } from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
registerCoverageHooks();

test("an editable result with an unverified computed source identity refuses multiline paste",
    async ({ page }, testInfo) => {
        test.setTimeout(240000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        const queryEditor = new SqlEditorHelper(fixture.gridA.getByTestId("yjs-table-query-input"));
        // The real SELECT returns the actual Table name, but an expression is not
        // authoritative source_kind evidence. There is one supplier and one plain
        // physical value column: this is unavailable row ownership, not a UNION
        // ambiguity, missing mocked metadata, or a non-string field.
        await queryEditor.fillAndCommit(page,
            `SELECT ('${fixture.tableA.sqlName}' || '') AS source_kind, id AS source_id, title AS value FROM ${fixture.tableA.sqlName}`);
        const grid = fixture.gridA.getByTestId("yjs-table-grid");
        await expect(grid.locator("tbody tr")).toHaveCount(1);
        await expect(grid.getByTestId("grid-readonly-reason")).toHaveCount(0);
        const cell = grid.locator('td[data-col="value"]');
        await expect(cell.locator("button.cell-value")).toHaveText("Value from A");
        const original = await snapshotProject(page);
        await cell.locator("button.cell-value").click();
        const editor = cell.locator("textarea.cell-input");
        await expect(editor).toBeFocused();
        await editor.fill("selection remains");
        await editor.press("Home");
        await editor.press("ArrowRight");
        await editor.press("Shift+ArrowRight");
        await editor.press("Shift+ArrowRight");
        await editor.press("Shift+ArrowRight");
        await editor.press("Shift+ArrowRight");
        const selection = () => editor.evaluate(node => [
            (node as HTMLTextAreaElement).selectionStart,
            (node as HTMLTextAreaElement).selectionEnd,
        ]);
        await expect.poll(selection).toEqual([1, 5]);
        await page.evaluate(() => navigator.clipboard.writeText("one\r\ntwo"));
        await editor.press("Control+V");
        await expect(cell.getByRole("alert")).toContainText("does not accept line breaks");
        await expect(editor).toHaveValue("selection remains");
        await expect(editor).toBeFocused();
        await expect.poll(selection).toEqual([1, 5]);
        expect(await snapshotProject(page)).toEqual(original);
        // The insertion refusal must leave the native editor usable, without
        // granting the missing source authority or claiming a successful commit.
        await editor.press("x");
        await expect(editor).toHaveValue("sxtion remains");
        await editor.press("Escape");
        await expect(editor).toHaveCount(0);
        expect(await snapshotProject(page)).toEqual(original);
        expect(original.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId].title)
            .toBe("Value from A");
    });
