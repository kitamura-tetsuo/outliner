import { expect, type Locator, type Page } from "@playwright/test";
import { createBlockFromItem } from "./nodeKindHelpers";

export async function createCalendarBlockForLabel(page: Page, label: string): Promise<Locator> {
    const row = page.locator(".outliner-item").filter({ hasText: label }).first();
    const itemId = await row.getAttribute("data-item-id");
    expect(itemId).toBeTruthy();
    const createdRow = await createBlockFromItem(page, page.locator(`[data-item-id="${itemId}"]`), "Calendar");
    return createdRow;
}

export async function calendarProjectState(page: Page) {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-globals
        const project = (window as any).generalStore.project;
        const tables = project.ydoc.getMap("yjsTables");
        const calendars = [...project.calendars.entries()].map(([id, entry]: [string, any]) => ({
            id,
            ...entry.toJSON(),
        }));
        return {
            tableCount: tables.size,
            gridCount: project.ydoc.getMap("yjsGrids").size,
            calendars,
            tableRecords: [...tables.entries()].map(([id, entry]: [string, any]) => ({
                id,
                sqlName: entry.get("sqlName"),
                recordCount: entry.get("doc")?.getMap("data").size ?? 0,
            })),
        };
    });
}

export async function createPresetCalendar(
    blockRow: Locator,
    input: { preset: "blank" | "tasks" | "habits"; name: string; sqlName: string; },
): Promise<void> {
    const block = blockRow.getByTestId("calendar-block");
    await block.getByRole("button", { name: "New Table", exact: true }).click();
    await block.getByTestId("yjs-table-preset-select").selectOption(input.preset);
    await block.getByTestId("yjs-table-name-input").fill(input.name);
    await block.getByTestId("yjs-table-sql-name-input").fill(input.sqlName);
    await block.getByTestId("yjs-table-create").click();
    await expect(block.getByTestId("calendar-view")).toBeVisible({ timeout: 15000 });
}
