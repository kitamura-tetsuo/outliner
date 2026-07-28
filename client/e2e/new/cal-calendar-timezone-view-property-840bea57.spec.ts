import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-840bea57
 *  Title   : Calendar timezone: explicit view property with SQL session parity
 *  Source  : docs/client-features/cal-calendar-timezone-view-property-840bea57.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-840bea57: the calendar's timezone is an explicit, visible view property", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Timezone demo item"]);
    });

    test("shows the viewer-local zone by default and switches to a fixed zone", async ({ page }) => {
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
        await page.getByTestId("calendar-name-input").first().fill("Timezone Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        // No timezone stored yet: the active label reads the viewer's own
        // resolved zone, and the select shows the "Viewer-local" option.
        const activeTimezone = page.getByTestId("calendar-active-timezone").first();
        await expect(activeTimezone).toBeVisible({ timeout: 15000 });
        const viewerLocalZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
        await expect(activeTimezone).toHaveText(viewerLocalZone);

        // Switching to a fixed zone updates the active-timezone label and
        // re-runs the query without error. The *range window* is also
        // recomputed in the new zone (covered by calendarViewRange.test.ts's
        // cross-zone unit tests), but whether the displayed week-range label
        // text actually changes depends on how close "now" happens to be to
        // a week boundary between the two zones at the moment the suite
        // runs, which an e2e run cannot control — so this only asserts the
        // parts that are guaranteed regardless of the clock.
        const timezoneSelect = page.getByTestId("calendar-timezone-select").first();
        await timezoneSelect.selectOption("Asia/Tokyo");
        await expect(activeTimezone).toHaveText("Asia/Tokyo");
        await expect(page.getByTestId("calendar-range-label").first()).toBeVisible();
        await expect(page.getByTestId("calendar-query-error")).toHaveCount(0);

        // Clearing back to "Viewer-local" restores the resolved local zone.
        await timezoneSelect.selectOption("");
        await expect(activeTimezone).toHaveText(viewerLocalZone);
    });
});
