import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-7b2f19ac
 *  Title   : Calendar indicator and schedule details on the source outline item
 *  Source  : docs/client-features/cal-item-schedule-indicator-7b2f19ac.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { configureItemsCalendar, outlineItemIds, scheduleOutlineItem } from "./helpers/calendarIndicatorSetup";

test.describe("FTR-7b2f19ac: calendar indicator on the source outline item", () => {
    /** The seeded "Standup" row: the one given a schedule, and the one asserted on. */
    let scheduledId = "";

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Standup"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        [, scheduledId] = await outlineItemIds(page);
        // 09:00 UTC today, so the entry always falls inside the membership
        // window whatever day the suite runs on.
        const today = new Date().toISOString().slice(0, 10);
        await scheduleOutlineItem(page, scheduledId, {
            start: `${today}T09:00:00.000Z`,
            allDay: false,
            duration: "PT30M",
        });
    });

    test("shows the schedule on the source item, in the calendar's timezone, and keeps it current", async ({ page }) => {
        // The Calendar block is a new row created beside "Calendar anchor"
        // (#5015), so the scheduled item is addressed by id rather than by a
        // position the insertion would have shifted.
        await configureItemsCalendar(page, { name: "Team", timezone: "Asia/Tokyo" });

        const scheduledItem = page.locator(`.outliner-item[data-item-id="${scheduledId}"]`);
        await expect(scheduledItem).toBeVisible({ timeout: 10000 });
        const indicator = scheduledItem.locator('[data-testid^="calendar-indicator-"]');
        await expect(indicator).toBeVisible({ timeout: 30000 });

        // Keyboard focus (not hover) must expose the same details.
        await indicator.focus();
        const tooltip = scheduledItem.locator('[data-testid^="calendar-schedule-tooltip-"]');
        await expect(tooltip).toBeVisible({ timeout: 10000 });
        // 09:00Z is 18:00 in Asia/Tokyo: the calendar's zone, not the viewer's.
        await expect(tooltip).toContainText("Team:");
        await expect(tooltip).toContainText("18:00 – 18:30 (30m)");
        await expect(tooltip).toContainText("(Asia/Tokyo)");

        // Rescheduling the entry (the same write a drag performs) updates the
        // source item's tooltip without a reload.
        const today = new Date().toISOString().slice(0, 10);
        await scheduleOutlineItem(page, scheduledId, { start: `${today}T11:00:00.000Z` });
        await expect(tooltip).toContainText("20:00 – 20:30 (30m)", { timeout: 30000 });

        // Clearing the date removes the entry from the calendar, and with it
        // the indicator — no other calendar membership remains.
        await scheduleOutlineItem(page, scheduledId, { start: null, duration: null });
        await expect(indicator).toHaveCount(0, { timeout: 30000 });
    });
});
