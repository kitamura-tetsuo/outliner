// Shared setup for the "open a calendar event's source outline item" specs
// (FTR-6b1d94af). Building a calendar takes the same dozen UI steps every
// time — slash command, create panel, query, role assignment — and repeating
// them inline would push each spec well past the length Playwright runs
// reliably here (AGENTS.md §2).

import { expect, type Page } from "@playwright/test";
import { createBlockFromItem } from "../utils/nodeKindHelpers";

/**
 * The outline query every one of these specs uses: outline items addressed by
 * their own tree key, which is what makes an entry navigable back to its
 * source.
 */
export const OUTLINE_ITEMS_QUERY = "SELECT id, text AS title, all_day, start_at, duration, "
    + "'outline_items' AS source_kind, id AS source_id FROM outline_items";

/** Create a calendar block from the outline item `anchorKey` and configure it over `query`. */
export async function createCalendarOnItem(
    page: Page,
    anchorKey: string,
    name: string,
    query: string = OUTLINE_ITEMS_QUERY,
): Promise<void> {
    const item = page.locator(`.outliner-item[data-item-id="${anchorKey}"]`);
    // Node kinds are immutable (#5015): the block is created by the
    // slash command, not by converting this row.
    await createBlockFromItem(page, item, "Calendar");

    const createPanel = page.getByTestId("calendar-create-panel").first();
    await expect(createPanel).toBeVisible({ timeout: 10000 });
    await page.getByTestId("calendar-name-input").first().fill(name);
    await page.getByTestId("calendar-create").first().click();

    await expect(page.getByTestId("calendar-view").first()).toBeVisible({ timeout: 15000 });

    const queryInput = page.getByTestId("calendar-query-input").first();
    await queryInput.fill(query);
    await queryInput.blur();
    await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

    await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
    await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
    await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
    await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");
}

/** The entry card of the outline item `itemKey`, in whichever grid drew it. */
export function entryFor(page: Page, itemKey: string) {
    return page.getByTestId(`calendar-entry-outline_items:${itemKey}`).first();
}
