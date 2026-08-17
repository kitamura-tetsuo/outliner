import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-4c17e9d2
 *  Title   : Hour Map single-day calendar view (hour x minute matrix)
 *  Source  : docs/client-features/cal-hour-map-single-day-view-4c17e9d2.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-4c17e9d2: Hour Map single-day calendar view", () => {
    test("wraps a multi-hour entry across hour rows, titling it once", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Workshop"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        // 09:45 local for 95 minutes: the entry must span the 09, 10 and 11
        // rows. The calendar's timezone stays viewer-local (the default), so
        // the wall-clock hours the browser sees are the ones it renders.
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const local = new Date();
            local.setHours(9, 45, 0, 0);
            const item = items.at(1);
            item.start = local.toISOString();
            item.allDay = false;
            item.duration = "PT1H35M";
        });

        const item = page.locator(".outliner-item").nth(1);
        await expect(item).toBeVisible({ timeout: 10000 });
        await item.click();
        await page.waitForTimeout(300);
        await item.click({ button: "right" });
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible({ timeout: 10000 });
        await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

        const createPanel = page.getByTestId("calendar-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("Hour Map Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill(
            "SELECT id, text AS title, all_day, start_at, duration, "
                + "'outline_items' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
        await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
        await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");

        await page.getByTestId("calendar-view-type").first().selectOption("hours");
        await expect(page.getByTestId("calendar-hour-minute-grid").first()).toBeVisible({ timeout: 15000 });
        // The stored view type persists, and the vertical time grid is gone.
        await expect(page.getByTestId("calendar-view-type").first()).toHaveValue("hours");
        await expect(page.getByTestId("calendar-time-grid")).toHaveCount(0);

        // 24 wall-clock hour rows, and the entry folded into three of them.
        await expect(page.locator('[data-testid^="calendar-hour-row-"]')).toHaveCount(24);
        const fragments = page.locator('[data-entry-key^="outline_items:"]');
        await expect(fragments).toHaveCount(3);
        await expect(fragments.nth(0)).toHaveAttribute("data-hour", "9");
        await expect(fragments.nth(1)).toHaveAttribute("data-hour", "10");
        await expect(fragments.nth(2)).toHaveAttribute("data-hour", "11");

        // The title is drawn once across the whole wrapped entry.
        await expect(page.locator('[data-testid="calendar-entry-title"]')).toHaveCount(1);
        await expect(page.locator('[data-testid="calendar-entry-title"]')).toContainText("Workshop");
    });
});
