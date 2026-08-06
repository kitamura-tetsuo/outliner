import { expect, type Page } from "@playwright/test";

/**
 * Helpers shared by the TBL-673b2241 column-reordering specs: creating a Tasks
 * preset table block and driving HTML5 drag & drop over its column headers /
 * UI Definition rows.
 */

/** Columns the Tasks preset query returns, in their initial order. */
export const TASKS_PRESET_COLUMNS = ["id", "title", "status", "priority", "due_date", "repeat_days"];

/**
 * Turns the outliner item with `itemId` into a Tasks preset table block and
 * waits until the grid has rendered its columns. The host is addressed by
 * `data-item-id` so the scenario never depends on rendered order.
 */
export async function createTasksTableBlock(page: Page, itemId: string): Promise<void> {
    const item = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
    await expect(item).toBeVisible({ timeout: 10000 });
    await item.click();
    await page.waitForTimeout(300);

    const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn:not(.undo-redo-btn)").first();
    await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
    await addDatabaseBtn.click();

    const createPanel = page.getByTestId("yjs-table-create-panel").first();
    await expect(createPanel).toBeVisible({ timeout: 10000 });
    await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
    await page.getByTestId("yjs-table-create").first().click();

    await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 15000 });
    await waitForGridColumns(page);
}

/** Waits until the grid has rendered the Tasks preset columns. */
export async function waitForGridColumns(page: Page): Promise<void> {
    await expect(page.getByTestId("yjs-table-grid").first().locator("th[data-col='title']"))
        .toBeVisible({ timeout: 30000 });
}

/** Header (`th[data-col]`) order currently rendered by the grid. */
export async function gridHeaderOrder(page: Page): Promise<string[]> {
    return page.getByTestId("yjs-table-grid").first().locator("th[data-col]").evaluateAll((ths) =>
        ths.map((th) => th.getAttribute("data-col") ?? "")
    );
}

/** Body-cell (`td[data-col]`) order of the grid's first row. */
export async function gridFirstRowCellOrder(page: Page): Promise<string[]> {
    return page.getByTestId("yjs-table-grid").first().locator("tbody tr").first().locator("td[data-col]")
        .evaluateAll((tds) => tds.map((td) => td.getAttribute("data-col") ?? ""));
}

/** Column order shown by the UI Definition editor's row list. */
export async function uiEditorRowOrder(page: Page): Promise<string[]> {
    return page.getByTestId("yjs-table-ui-editor").first().locator(".component-row .column-name")
        .evaluateAll((names) => names.map((n) => n.textContent?.trim() ?? ""));
}

/**
 * Dispatches the full native HTML5 drag sequence (`dragstart` / `dragenter` /
 * `dragover` / `drop` / `dragend`) with a genuine `DataTransfer` from one
 * element to another. `dragenter` is included because it fires first in a real
 * drag and OutlinerItem reacts to it too.
 *
 * The events are dispatched on the elements themselves so that they travel the
 * real capture-then-bubble path: OutlinerItem's capture-phase `drop` listener
 * sees them first, which is exactly the interaction this feature regressed on.
 *
 * `side` selects which half of the target the pointer lands on, since both drop
 * handlers use the pointer position to decide whether to insert before or after.
 */
export async function dragElementOnto(
    page: Page,
    sourceSelector: string,
    targetSelector: string,
    side: "left" | "right" | "above" | "below",
): Promise<void> {
    await page.evaluate(({ sourceSelector, targetSelector, side }) => {
        const source = document.querySelector<HTMLElement>(sourceSelector);
        const target = document.querySelector<HTMLElement>(targetSelector);
        if (!source || !target) {
            throw new Error(`Drag source or target not found: ${sourceSelector} -> ${targetSelector}`);
        }

        const dataTransfer = new DataTransfer();
        const sourceRect = source.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();

        const clientX = side === "left"
            ? Math.floor(targetRect.left + targetRect.width * 0.25)
            : side === "right"
            ? Math.floor(targetRect.left + targetRect.width * 0.75)
            : Math.floor(targetRect.left + targetRect.width / 2);
        const clientY = side === "above"
            ? Math.floor(targetRect.top + targetRect.height * 0.25)
            : side === "below"
            ? Math.floor(targetRect.top + targetRect.height * 0.75)
            : Math.floor(targetRect.top + targetRect.height / 2);

        source.dispatchEvent(
            new DragEvent("dragstart", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: Math.floor(sourceRect.left + sourceRect.width / 2),
                clientY: Math.floor(sourceRect.top + sourceRect.height / 2),
            }),
        );
        const at = { bubbles: true, cancelable: true, dataTransfer, clientX, clientY };
        for (const type of ["dragenter", "dragover", "drop"]) {
            target.dispatchEvent(new DragEvent(type, at));
        }
        source.dispatchEvent(new DragEvent("dragend", at));
    }, { sourceSelector, targetSelector, side });
}

/** Drags the `from` column header onto the given half of the `to` column header. */
export async function dragColumnHeader(
    page: Page,
    from: string,
    to: string,
    side: "left" | "right",
): Promise<void> {
    await dragElementOnto(
        page,
        `[data-testid="yjs-table-grid"] th[data-col="${from}"] .column-drag-handle`,
        `[data-testid="yjs-table-grid"] th[data-col="${to}"]`,
        side,
    );
}

/** Drags the `from` UI Definition editor row onto the given half of the `to` row. */
export async function dragUiEditorRow(
    page: Page,
    from: string,
    to: string,
    side: "above" | "below",
): Promise<void> {
    await dragElementOnto(
        page,
        `[data-testid="yjs-table-ui-editor"] .component-row[data-col="${from}"]`,
        `[data-testid="yjs-table-ui-editor"] .component-row[data-col="${to}"]`,
        side,
    );
}
