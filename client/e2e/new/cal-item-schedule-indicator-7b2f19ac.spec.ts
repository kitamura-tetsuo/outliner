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

test.describe("FTR-7b2f19ac: calendar indicator on the source outline item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Standup"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        // 09:00 UTC today, so the entry always falls inside the membership
        // window whatever day the suite runs on.
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            items.at(1).start = `${today}T09:00:00.000Z`;
            items.at(1).allDay = false;
            items.at(1).duration = "PT30M";
        });
    });

    test("shows the schedule on the source item, in the calendar's timezone, and keeps it current", async ({ page }) => {
        // The calendar block lives on the page-title row's first child; the
        // *scheduled* item is the one below it, and that is where the
        // indicator has to appear.
        await configureItemsCalendar(page, { name: "Team", timezone: "Asia/Tokyo" });

        const scheduledItem = page.locator(".outliner-item").nth(2);
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
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            items.at(1).start = `${today}T11:00:00.000Z`;
        });
        await expect(tooltip).toContainText("20:00 – 20:30 (30m)", { timeout: 30000 });

        // Clearing the date removes the entry from the calendar, and with it
        // the indicator — no other calendar membership remains.
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            items.at(1).start = undefined;
            items.at(1).duration = undefined;
        });
        await expect(indicator).toHaveCount(0, { timeout: 30000 });
    });
});
