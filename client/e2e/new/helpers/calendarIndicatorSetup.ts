// Shared setup for the source-item calendar indicator specs (FTR-7b2f19ac).
//
// Both specs need the same thing: a calendar block whose query projects
// `outline_items` with source identity and the roles assigned. Keeping it here keeps each spec short enough for Playwright
// to run reliably (AGENTS.md §2).

import { expect, type Locator, type Page } from "@playwright/test";
import { createBlockFromItem } from "../../utils/nodeKindHelpers";

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
    /**
     * The outline row to create the block from. Prefer this over `itemIndex`:
     * creating a block inserts a row (#5015), so a position taken before the
     * first block was created no longer addresses the same row afterwards.
     */
    item?: Locator;
    /** Which `.outliner-item` row to create the block from. Defaults to the first item under the title. */
    itemIndex?: number;
}

/**
 * Create a calendar block from one outline row, point it at `outline_items`
 * and assign the title/start/all-day/duration roles.
 */
export async function configureItemsCalendar(page: Page, options: ItemsCalendarOptions): Promise<Locator> {
    const item = options.item ?? page.locator(".outliner-item").nth(options.itemIndex ?? 1);
    // Node kinds are immutable (#5015): the block is a new row created by the
    // slash command, not this row converted - so everything below is scoped to
    // the Calendar node it returns.
    const block = await createBlockFromItem(page, item, "Calendar");

    const createPanel = block.getByTestId("calendar-create-panel");
    await expect(createPanel).toBeVisible({ timeout: 10000 });
    await createPanel.getByTestId("calendar-name-input").fill(options.name);
    await createPanel.getByTestId("calendar-create").click();

    const view = block.getByTestId("calendar-view");
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

/** The ids of the page's top-level outline rows, in order. */
export async function outlineItemIds(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const ids: string[] = [];
        for (let index = 0; index < items.length; index++) ids.push(String(items.at(index).id));
        return ids;
    });
}

export interface SchedulePatch {
    /** An ISO instant, a plain date for an all-day item, or `null` to clear. */
    start?: string | null;
    allDay?: boolean;
    /** An ISO duration, or `null` to clear. */
    duration?: string | null;
}

/**
 * Write schedule fields onto the row with `itemId`.
 *
 * Rows are addressed by id rather than position because creating a block
 * inserts a row (#5015), which shifts every index after it.
 */
export async function scheduleOutlineItem(page: Page, itemId: string, patch: SchedulePatch): Promise<void> {
    await page.evaluate(({ itemId, patch }) => {
        const items = (globalThis as any).generalStore.currentPage.items;
        for (let index = 0; index < items.length; index++) {
            const item = items.at(index);
            if (String(item.id) !== itemId) continue;
            if (patch.start !== undefined) item.start = patch.start ?? undefined;
            if (patch.allDay !== undefined) item.allDay = patch.allDay;
            if (patch.duration !== undefined) item.duration = patch.duration ?? undefined;
            return;
        }
        throw new Error(`No outline item with id ${itemId}`);
    }, { itemId, patch });
}
