// Shared setup for the source-item calendar indicator specs (FTR-7b2f19ac).
//
// Both specs need the same thing: an outline item converted into a calendar
// block whose query projects `outline_items` with source identity and the
// roles assigned. Keeping it here keeps each spec short enough for Playwright
// to run reliably (AGENTS.md §2).

import { expect, type Locator, type Page } from "@playwright/test";

/** A query carrying `source_kind`/`source_id`, so its rows are addressable. */
export const ITEMS_CALENDAR_QUERY = "SELECT id, text AS title, all_day, start_at, start_on, duration, "
    + "'item' AS source_kind, id AS source_id FROM outline_items";

export interface ItemsCalendarOptions {
    name: string;
    timezone?: string;
    /**
     * Which projected column carries the start: the timed `start_at`, or the
     * floating `start_on` an all-day item is stored in.
     */
    startColumn?: "start_at" | "start_on";
    /** Which `.outliner-item` row to convert. Defaults to the first item under the title. */
    itemIndex?: number;
}

/**
 * Convert one outline row into a calendar block, point it at
 * `outline_items` and assign the title/start/all-day/duration roles.
 */
export async function configureItemsCalendar(page: Page, options: ItemsCalendarOptions): Promise<Locator> {
    const item = page.locator(".outliner-item").nth(options.itemIndex ?? 1);
    await expect(item).toBeVisible({ timeout: 10000 });
    await item.click();
    await page.waitForTimeout(300);
    await item.click({ button: "right" });
    const contextMenu = page.locator(".context-menu");
    await expect(contextMenu).toBeVisible({ timeout: 10000 });
    await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

    const createPanel = item.getByTestId("calendar-create-panel");
    await expect(createPanel).toBeVisible({ timeout: 10000 });
    await createPanel.getByTestId("calendar-name-input").fill(options.name);
    await createPanel.getByTestId("calendar-create").click();

    const view = item.getByTestId("calendar-view");
    await expect(view).toBeVisible({ timeout: 20000 });

    if (options.timezone) {
        await view.getByTestId("calendar-timezone-select").selectOption(options.timezone);
        await expect(view.getByTestId("calendar-active-timezone")).toHaveText(options.timezone, { timeout: 10000 });
    }

    const queryInput = view.getByTestId("calendar-query-input");
    await queryInput.fill(ITEMS_CALENDAR_QUERY);
    await queryInput.blur();
    await expect(view.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 20000 });

    await expect
        .poll(async () => view.getByTestId("calendar-role-roleTitle").locator("option").allTextContents(), {
            timeout: 20000,
        })
        .toContain("title");
    await view.getByTestId("calendar-role-roleTitle").selectOption("title");
    await view.getByTestId("calendar-role-roleStart").selectOption(options.startColumn ?? "start_at");
    await view.getByTestId("calendar-role-roleAllDay").selectOption("all_day");
    await view.getByTestId("calendar-role-roleDuration").selectOption("duration");

    return view;
}
