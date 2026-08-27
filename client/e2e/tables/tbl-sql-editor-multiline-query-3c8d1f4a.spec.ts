import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TBL-3c8d1f4a
 *  Title   : Monaco-based SQL editor for Grid schema and query
 *  Source  : docs/client-features/tbl-monaco-sql-editor-3c8d1f4a.yaml
 *
 *  Regression: the Query (SELECT) field used to be a single-line <input>, so
 *  committing an edited multiline query collapsed
 *  `FROM routine_occurrences r\nWHERE NOT EXISTS` into `rWHERE` and the Grid
 *  failed with `syntax error at or near "rWHERE"`.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";

const BOUNDARY = "FROM routine_occurrences r\nWHERE NOT EXISTS";

async function openRoutineOccurrences(page: Page) {
    await page.goto("/demo");
    const pageList = page.getByTestId("demo-page-list");
    await expect(pageList).toBeVisible({ timeout: 30000 });
    await pageList.getByText("Recurring Tasks", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/demo\/Recurring%20Tasks$/, { timeout: 15000 });

    const view = page.getByTestId("yjs-table-view").filter({
        has: page.getByTestId("yjs-table-name").getByText("Routine Occurrences", { exact: true }),
    }).first();
    await expect(view).toBeVisible({ timeout: 30000 });
    // PGlite loads lazily; the first query result can take a while.
    await expect(view.getByTestId("yjs-table-grid").locator("th", { hasText: "task_key" }))
        .toBeVisible({ timeout: 30000 });
    return view;
}

test.describe("TBL-3c8d1f4a: multiline SQL survives the Query editor", () => {
    test.beforeEach(() => {
        test.setTimeout(180000);
    });

    test("editing and committing the demo query keeps the r/WHERE line break", async ({ page }) => {
        const view = await openRoutineOccurrences(page);

        await view.getByTestId("yjs-table-toggle-ui").click();
        const queryEditor = new SqlEditorHelper(view.getByTestId("yjs-table-query-input"));
        await queryEditor.waitForReady();

        // The seeded query is multiline and is shown as such.
        expect(await queryEditor.value()).toContain(BOUNDARY);

        // The regression gesture: one harmless space, then leave the editor.
        await queryEditor.focus();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.type(" ");
        await queryEditor.commit(page);

        // The Grid still runs: no `syntax error at or near "rWHERE"`.
        await expect(view.getByTestId("yjs-table-query-error")).toBeHidden({ timeout: 30000 });
        await expect(view.getByTestId("yjs-table-grid").locator("tbody tr").first())
            .toBeVisible({ timeout: 30000 });

        // Re-open the panel so the editor is rebuilt from the stored UI
        // Definition -- this reads the committed value back out of Yjs.
        await view.getByTestId("yjs-table-toggle-ui").click();
        await expect(view.getByTestId("yjs-table-query-input")).toHaveCount(0);
        await view.getByTestId("yjs-table-toggle-ui").click();

        const reopened = new SqlEditorHelper(view.getByTestId("yjs-table-query-input"));
        await reopened.waitForReady();
        const stored = await reopened.value();
        expect(stored).toContain(BOUNDARY);
        expect(stored).not.toContain("rWHERE");
    });

    test("Enter, Tab and Backspace inside the query editor never reach the outline", async ({ page }) => {
        const view = await openRoutineOccurrences(page);
        const itemCountBefore = await page.locator(".outliner-item[data-item-id]").count();

        await view.getByTestId("yjs-table-toggle-ui").click();
        const queryEditor = new SqlEditorHelper(view.getByTestId("yjs-table-query-input"));
        await queryEditor.waitForReady();

        await queryEditor.focus();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.press("Enter");
        await page.keyboard.press("Tab");
        await page.keyboard.type("-- note");
        await page.keyboard.press("Backspace");

        expect(await queryEditor.hasFocus()).toBe(true);
        expect(await queryEditor.value()).toContain("-- not");
        expect(await page.locator(".outliner-item[data-item-id]").count()).toBe(itemCountBefore);
    });
});
