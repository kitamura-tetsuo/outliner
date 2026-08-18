import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-7b2f19ac
 *  Title   : Calendar indicator and schedule details on the source outline item
 *  Source  : docs/client-features/cal-item-schedule-indicator-7b2f19ac.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { configureItemsCalendar } from "./helpers/calendarIndicatorSetup";

test.describe("FTR-7b2f19ac: an item on two calendars, and an all-day item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Anchor one",
            "Anchor two",
            "Standup",
            "Launch day",
        ]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            items.at(2).start = `${today}T09:00:00.000Z`;
            items.at(2).allDay = false;
            items.at(2).duration = "PT30M";
            // An all-day item stores a floating date, projected as `start_on`.
            items.at(3).start = today;
            items.at(3).allDay = true;
        });
    });

    test("shows every calendar membership, and an all-day item as a date", async ({ page }) => {
        // Two fixed, DST-free zones, so the expected wall-clock times below are
        // stable whatever the runner's own zone and time of year: Africa/Abidjan
        // is UTC+00 all year, Asia/Tokyo UTC+09. ("UTC" itself is not among the
        // zones `Intl.supportedValuesOf` offers, so it is not in the picker.)
        await configureItemsCalendar(page, { name: "Team", timezone: "Africa/Abidjan", itemIndex: 1 });
        await configureItemsCalendar(page, {
            name: "Personal",
            timezone: "Asia/Tokyo",
            startColumn: "start_on",
            itemIndex: 2,
        });

        // The timed item is on "Team" (start_at) only; the all-day one is on
        // "Personal" (start_on) only — and both indicators must appear.
        const timedItem = page.locator(".outliner-item").nth(3);
        const allDayItem = page.locator(".outliner-item").nth(4);
        const timedIndicator = timedItem.locator('[data-testid^="calendar-indicator-"]');
        const allDayIndicator = allDayItem.locator('[data-testid^="calendar-indicator-"]');
        await expect(timedIndicator).toBeVisible({ timeout: 30000 });
        await expect(allDayIndicator).toBeVisible({ timeout: 30000 });

        await allDayIndicator.focus();
        const allDayTooltip = allDayItem.locator('[data-testid^="calendar-schedule-tooltip-"]');
        await expect(allDayTooltip).toContainText("Personal:", { timeout: 10000 });
        await expect(allDayTooltip).toContainText("(all day)");
        await expect(allDayTooltip).toContainText("(Asia/Tokyo)");

        // Widen the second calendar so it also matches the timed item: the
        // source item must then advertise *both* memberships, not one.
        const personalView = page.locator(".outliner-item").nth(2).getByTestId("calendar-view");
        await personalView.getByTestId("calendar-role-roleStart").selectOption("start_at");

        await expect(timedIndicator).toHaveAttribute("data-calendar-count", "2", { timeout: 30000 });
        await timedIndicator.focus();
        const timedTooltip = timedItem.locator('[data-testid^="calendar-schedule-tooltip-"]');
        await expect(timedTooltip).toContainText("Team:", { timeout: 10000 });
        await expect(timedTooltip).toContainText("Personal:");
        await expect(timedTooltip).toContainText("09:00 – 09:30 (30m)");
        await expect(timedTooltip).toContainText("18:00 – 18:30 (30m)");
    });
});
