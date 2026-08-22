import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9ce96e44
 *  Title   : Day / multi-day / week / month calendar views with drag and resize
 *  Source  : docs/client-features/cal-day-week-month-grid-views-9ce96e44.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
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
        // .outliner-item.first() is the page title row, whose context menu is
        // a no-op (handleContextMenu returns early for isPageTitle); use the
        // seeded item below it instead.
        const item = page.locator(".outliner-item").nth(1);
        // Node kinds are immutable (#5015): the block is created by the
        // slash command, not by converting this row.
        await createBlockFromItem(page, item, "Calendar");

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
        // The card also carries a delete affordance now (#4349), so assert on
        // the title element rather than the card's whole text content.
        await expect(timedEntry.getByTestId("calendar-entry-title")).toHaveText("Standup");
        await expect(timedEntry).not.toHaveClass(/not-writable/);

        // Switching to month view keeps showing the same entry, laid out in
        // its day cell instead of the hour grid.
        await page.getByTestId("calendar-view-type").first().selectOption("month");
        await expect(page.getByTestId("calendar-month-grid").first()).toBeVisible({ timeout: 15000 });
        const monthEntry = page.locator('[data-testid^="calendar-entry-item:"]').first();
        await expect(monthEntry).toBeVisible({ timeout: 15000 });
        await expect(monthEntry.getByTestId("calendar-entry-title")).toHaveText("Standup");

        // Reload: the view-type choice is a Yjs write and survives it.
        await page.reload();
        await expect(page.getByTestId("calendar-view-type").first()).toHaveValue("month", { timeout: 15000 });
    });

    test("an entry backed by a calculated (non-writable) column shows no drag affordance", async ({ page }) => {
        // .outliner-item.first() is the page title row, whose context menu is
        // a no-op (handleContextMenu returns early for isPageTitle); use the
        // seeded item below it instead.
        const item = page.locator(".outliner-item").nth(1);
        // Node kinds are immutable (#5015): the block is created by the
        // slash command, not by converting this row.
        await createBlockFromItem(page, item, "Calendar");

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

    test("Dragging a timed entry produces no text selection", async ({ page }) => {
        const item = page.locator(".outliner-item").nth(1);
        // Node kinds are immutable (#5015): the block is created by the
        // slash command, not by converting this row.
        await createBlockFromItem(page, item, "Calendar");

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

        await expect(page.getByTestId("calendar-time-grid").first()).toBeVisible({ timeout: 15000 });
        const entry = page.locator('[data-testid^="calendar-entry-item:"]').first();
        await expect(entry).toBeVisible({ timeout: 15000 });
        await expect(entry).not.toHaveClass(/not-writable/, { timeout: 15000 });

        await entry.hover({ position: { x: 10, y: 10 } });
        const entryBox = await entry.boundingBox();
        if (!entryBox) throw new Error("Entry box missing");

        const grid = page.getByTestId("calendar-time-grid").first();
        await page.mouse.down();
        await expect(grid).toHaveClass(/dragging/);

        await page.mouse.move(entryBox.x + 20, entryBox.y + 20, { steps: 5 });

        let selection = await page.evaluate(() => getSelection()?.toString());
        expect(selection).toBe("");

        await page.mouse.up();

        selection = await page.evaluate(() => getSelection()?.toString());
        expect(selection).toBe("");
    });
});
