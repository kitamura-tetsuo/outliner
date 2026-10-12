import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { addSourceRecord, setCellValue } from "./crossProjectGridHelpers";
import { SqlEditorHelper } from "./sqlEditorHelpers";
import { TestHelpers } from "./testHelpers";

/** Private rows with an order unaffected by title/status edits or other specs. */
export async function prepareKeyboardGrid(page: Page, testInfo: TestInfo): Promise<[string, string]> {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Keyboard grid"]);
    await page.locator(".outliner-item[data-item-id]").last().click();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    const panel = page.getByTestId("yjs-table-create-panel");
    await expect(panel).toBeVisible();
    await panel.getByTestId("yjs-table-name-input").fill("Keyboard tasks");
    await panel.getByTestId("yjs-table-preset-select").selectOption("tasks");
    await panel.getByTestId("yjs-table-sql-name-input").fill("keyboard_tasks");
    await panel.getByTestId("yjs-table-create").click();

    const view = page.getByTestId("yjs-table-view");
    await expect(view).toBeVisible();
    if (!await view.getByTestId("yjs-table-query-input").isVisible()) {
        await view.getByTestId("yjs-table-toggle-ui").click();
    }
    await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(
        page,
        "SELECT id, title, status, priority, due_date, repeat_days FROM keyboard_tasks ORDER BY id",
    );
    await addSourceRecord(page);
    await addSourceRecord(page, 0, 2);
    const rows = view.getByTestId("yjs-table-grid").locator("tbody tr");
    const ids = await rows.evaluateAll(elements => elements.map(element => element.getAttribute("data-record-id")!));
    expect(ids).toHaveLength(2);
    expect(ids.every(Boolean)).toBe(true);
    expect(ids).toEqual([...ids].sort());
    await setCellValue(page, 0, ids[0], "title", "Alpha");
    await setCellValue(page, 0, ids[1], "title", "Beta");
    await expect(rows).toHaveCount(2);
    return [ids[0], ids[1]];
}

export function keyboardTaskRow(page: Page, recordId: string): Locator {
    return page.getByTestId("yjs-table-grid").locator(`tbody tr[data-record-id='${recordId}']`);
}

/** Cancel a real edit, then wait for navigation mode and its focus restoration. */
export async function selectAndFocusCell(cell: Locator): Promise<void> {
    await cell.locator("button").click();
    await expect(cell.locator("input")).toBeFocused();
    await cell.locator("input").press("Escape");
    await expect(cell.locator("input")).toHaveCount(0);
    await expect(cell.locator("button")).toBeFocused();
    await expect(cell).toHaveClass(/grid-active/);
}
