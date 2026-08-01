import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9ce96e44
 *  Title   : Destination date/time tooltip while dragging or resizing a calendar entry
 *  Source  : docs/client-features/cal-day-week-month-grid-views-9ce96e44.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/** One hour of the time grid, in pixels (CalendarTimeGrid's ROW_HEIGHT_PX). */
const HOUR_PX = 48;

async function openWeekCalendar(page: Page) {
    const item = page.locator(".outliner-item").nth(1);
    await expect(item).toBeVisible({ timeout: 10000 });
    await item.click();
    await page.waitForTimeout(300);
    await item.click({ button: "right" });
    const contextMenu = page.locator(".context-menu");
    await expect(contextMenu).toBeVisible({ timeout: 10000 });
    await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

    await expect(page.getByTestId("calendar-create-panel").first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId("calendar-name-input").first().fill("Tooltip Calendar");
    await page.getByTestId("calendar-create").first().click();
    await expect(page.getByTestId("calendar-view").first()).toBeVisible({ timeout: 15000 });

    const queryInput = page.getByTestId("calendar-query-input").first();
    await queryInput.fill(
        "SELECT id, text AS title, all_day, start_at, duration, 'outline_items' AS source_kind, id AS source_id "
            + "FROM outline_items",
    );
    await queryInput.blur();
    await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

    await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
    await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
    await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
    await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");

    await expect(page.getByTestId("calendar-time-grid").first()).toBeVisible({ timeout: 15000 });
    const entry = page.locator('[data-testid^="calendar-entry-outline_items:"]').first();
    await expect(entry).toBeVisible({ timeout: 15000 });
    await expect(entry).not.toHaveClass(/not-writable/, { timeout: 15000 });
    return entry;
}

/** The entry's committed start, read back as `HH:MM` in the calendar's own timezone. */
async function committedStartLabel(page: Page): Promise<string> {
    const timeZone = (await page.getByTestId("calendar-active-timezone").first().textContent())?.trim() ?? "UTC";
    return await page.evaluate((tz) => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const start = new Date(String(items.at(1).start));
        return new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
            .format(start);
    }, timeZone);
}

test.describe("FTR-9ce96e44: drag destination tooltip", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Standup"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            items.at(1).start = `${today}T09:00:00.000Z`;
            items.at(1).allDay = false;
            items.at(1).duration = "PT30M";
        });
    });

    test("a move drag shows the destination instant, and the drop matches it", async ({ page }) => {
        const entry = await openWeekCalendar(page);
        const tooltip = page.getByTestId("calendar-drag-tooltip");
        await expect(tooltip).toHaveCount(0);

        // The grid scrolls to the working-hours band on mount, so read the
        // card's box only after hovering has settled it into place.
        await entry.hover({ position: { x: 10, y: 6 } });
        const box = await entry.boundingBox();
        if (!box) throw new Error("Entry box missing");
        await page.mouse.down();
        // Exactly one grid hour down: the snapped destination is the original
        // start + 1h, whatever the calendar's timezone renders that as.
        await page.mouse.move(box.x + 10, box.y + 6 + HOUR_PX, { steps: 8 });

        await expect(tooltip).toBeVisible({ timeout: 10000 });
        const label = (await tooltip.textContent())?.trim() ?? "";
        const match = /^(.+) (\d{2}:\d{2}) – (\d{2}:\d{2})$/.exec(label);
        expect(match, `unexpected tooltip label: ${label}`).not.toBeNull();
        const [, , destinationStart, destinationEnd] = match!;
        // The 30-minute entry keeps its length while it moves.
        const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
        expect((minutes(destinationEnd) - minutes(destinationStart) + 1440) % 1440).toBe(30);

        await page.mouse.up();
        await expect(tooltip).toHaveCount(0, { timeout: 10000 });
        await expect(page.getByTestId("calendar-write-error")).toHaveCount(0);

        // What the tooltip promised is what the drop wrote.
        await expect.poll(() => committedStartLabel(page), { timeout: 15000 }).toBe(destinationStart);
    });

    test("a resize drag shows the new span and its duration", async ({ page }) => {
        await openWeekCalendar(page);
        const handle = page.locator('[data-testid^="calendar-entry-resize-outline_items:"]').first();
        await expect(handle).toBeAttached({ timeout: 10000 });

        await handle.hover({ position: { x: 4, y: 2 } });
        const box = await handle.boundingBox();
        if (!box) throw new Error("Resize handle box missing");
        await page.mouse.down();
        // Drag the bottom edge one hour down: 30m + 60m = 1h30m.
        await page.mouse.move(box.x + 4, box.y + 2 + HOUR_PX, { steps: 8 });

        const tooltip = page.getByTestId("calendar-drag-tooltip");
        await expect(tooltip).toBeVisible({ timeout: 10000 });
        await expect(tooltip).toHaveText(/^\d{2}:\d{2} – \d{2}:\d{2} \(1h30m\)$/);

        await page.mouse.up();
        await expect(tooltip).toHaveCount(0, { timeout: 10000 });
    });
});
