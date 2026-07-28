import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9ce96e44
 *  Title   : Day / multi-day / week / month calendar views with drag and resize
 *  Source  : docs/client-features/cal-day-week-month-grid-views-9ce96e44.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-9ce96e44: day/week/month grid views", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Standup"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        // Give the second item a timed start + duration, so the grid has
        // something to draw: the field itemsRelation.ts projects as
        // all_day/start_on/start_at/duration (docs/crdt-sql-architecture.md §6.1).
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            items.at(1).start = `${today}T09:00:00.000Z`;
            items.at(1).allDay = false;
            items.at(1).duration = "PT30M";
        });
    });

    test("shows the entry in the week grid, and again after switching to month view", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.waitFor({ state: "attached" });
        await page.waitForTimeout(500);
        await item.waitFor({ state: "attached" });
        await page.waitForTimeout(500);
        await item.click({ button: "right" });
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible({ timeout: 10000 });
        await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

        const createPanel = page.getByTestId("calendar-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("Grid Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill(
            "SELECT id, text AS title, all_day, start_at, duration, 'item' AS source_kind, id AS source_id "
                + "FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
        await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
        await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");

        // Week view (the default) renders the entry in the time grid.
        await expect(page.getByTestId("calendar-time-grid").first()).toBeVisible({ timeout: 15000 });
        const timedEntry = page.locator('[data-testid^="calendar-entry-item:"]').first();
        await expect(timedEntry).toBeVisible({ timeout: 15000 });
        await expect(timedEntry).toHaveText("Standup");
        await expect(timedEntry).not.toHaveClass(/not-writable/);

        // Switching to month view keeps showing the same entry, laid out in
        // its day cell instead of the hour grid.
        await page.getByTestId("calendar-view-type").first().selectOption("month");
        await expect(page.getByTestId("calendar-month-grid").first()).toBeVisible({ timeout: 15000 });
        const monthEntry = page.locator('[data-testid^="calendar-entry-item:"]').first();
        await expect(monthEntry).toBeVisible({ timeout: 15000 });
        await expect(monthEntry).toHaveText("Standup");

        // Reload: the view-type choice is a Yjs write and survives it.
        await page.reload();
        await expect(page.getByTestId("calendar-view-type").first()).toHaveValue("month", { timeout: 15000 });
    });

    test("an entry backed by a calculated (non-writable) column shows no drag affordance", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.waitFor({ state: "attached" });
        await page.waitForTimeout(500);
        await item.waitFor({ state: "attached" });
        await page.waitForTimeout(500);
        await item.click({ button: "right" });
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible({ timeout: 10000 });
        await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

        const createPanel = page.getByTestId("calendar-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("Read-only Grid");
        await page.getByTestId("calendar-create").first().click();
        await expect(page.getByTestId("calendar-view").first()).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        // `upper(text)` has no writable origin, so the resolved title still
        // shows, but the entry itself must render as non-writable.
        await queryInput.fill(
            "SELECT id, upper(text) AS title, all_day, "
                + "COALESCE(start_on::text, start_at::text) AS start_at, duration, "
                + "'item' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
        await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");

        const entry = page.locator('[data-testid^="calendar-entry-item:"]').first();
        await expect(entry).toBeVisible({ timeout: 15000 });
        await expect(entry).toHaveClass(/not-writable/);
    });
});
