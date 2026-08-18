import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-6b1d94af
 *  Title   : Open a calendar event's source outline item on double-click
 *  Source  : docs/client-features/cal-open-source-item-6b1d94af.yaml
 */
import { expect, test } from "@playwright/test";
import { createCalendarOnItem } from "../utils/calendarSourceHelpers";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Both identity columns are present — the calendar is fully writable — but the
 * identity names no outline item. Nothing about such a row may look or behave
 * navigable.
 */
const FOREIGN_IDENTITY_QUERY = "SELECT id, text AS title, all_day, start_at, duration, "
    + "'generated' AS source_kind, 'generated-row-1' AS source_id FROM outline_items";

test.describe("FTR-6b1d94af: non-addressable rows", () => {
    test(
        "a row whose source id is not an outline item neither advertises nor performs navigation",
        async ({ page }, testInfo) => {
            test.setTimeout(120000);
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Rollup"]);
            await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

            const keys = await page.evaluate(() => {
                const items = [...(globalThis as any).generalStore.currentPage.items];
                const rollup = items.find((i: any) => i.text === "Rollup");
                const local = new Date();
                local.setHours(9, 0, 0, 0);
                rollup.start = local.toISOString();
                rollup.allDay = false;
                rollup.duration = "PT30M";
                return {
                    anchor: items.find((i: any) => i.text === "Calendar anchor").key as string,
                    rollup: rollup.key as string,
                };
            });

            await createCalendarOnItem(page, keys.anchor, "Foreign Identity Calendar", FOREIGN_IDENTITY_QUERY);

            const urlBefore = page.url();
            const entry = page.getByTestId("calendar-entry-generated:generated-row-1").first();
            await expect(entry).toBeVisible({ timeout: 15000 });
            await expect(entry).not.toHaveAttribute("data-navigable", "true");

            await entry.dblclick();
            await page.waitForTimeout(1000);

            // Still on the calendar, and the item the row was projected from did
            // not take the caret either.
            await expect(page).toHaveURL(urlBefore);
            await expect(page.locator(`.outliner-item[data-item-id="${keys.rollup}"]`))
                .toHaveAttribute("data-active", "false");
        },
    );
});
