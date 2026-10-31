import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9ce96e44
 *  Title   : Day / multi-day / week / month calendar views with drag and resize
 *  Source  : docs/client-features/cal-day-week-month-grid-views-9ce96e44.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

const originalStart = "2026-10-31T09:00:00.000Z";
const expectedStart = "2026-10-30T09:00:00.000Z";

async function outlineState(page: Page, scheduledId: string) {
    return await page.evaluate(id => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const rows = Array.from({ length: items.length }, (_, index) => items.at(index));
        return {
            ids: rows.map((item: any) => String(item.id)),
            start: rows.find((item: any) => String(item.id) === id)?.start,
        };
    }, scheduledId);
}

test.describe("FTR-9ce96e44: month grid drag and drop", () => {
    test.use({ locale: "en-US", timezoneId: "UTC" });
    let scheduledId = "";

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        // October 2026 ends on the last displayed Saturday, reproducing #5842 on any run date.
        await page.clock.setFixedTime(new Date("2026-10-31T12:00:00.000Z"));
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Standup"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        scheduledId = await page.evaluate(start => {
            const item = (globalThis as any).generalStore.currentPage.items.at(1);
            item.start = start;
            item.allDay = false;
            item.duration = "PT30M";
            return String(item.id);
        }, originalStart);

        await createBlockFromItem(page, page.locator(".outliner-item").nth(1), "Calendar");
        await expect(page.getByTestId("calendar-create-panel").first()).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("Grid Calendar");
        await page.getByTestId("calendar-create").first().click();
        await expect(page.getByTestId("calendar-view").first()).toBeVisible({ timeout: 15000 });
        const query = page.getByTestId("calendar-query-input").first();
        await query.fill(
            "SELECT id, text AS title, all_day, start_at, duration, 'outline_items' AS source_kind, id AS source_id FROM outline_items",
        );
        await query.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });
        await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
        await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
        await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");
        await page.getByTestId("calendar-view-type").first().selectOption("month");
        await expect(page.getByTestId("calendar-month-grid").first()).toBeVisible({ timeout: 15000 });
    });

    async function moveFromMonthEdge(page: Page) {
        const entry = page.locator('[data-testid^="calendar-entry-outline_items:"]').first();
        await expect(entry).toBeVisible({ timeout: 15000 });
        await expect(entry).toHaveAttribute("draggable", "true");
        const source = entry.locator('xpath=./ancestor::*[contains(@data-testid, "calendar-month-cell-")]');
        // October 31 is the last of 35 cells; the previous day is a distinct, available target.
        await expect(source).toHaveAttribute("data-testid", "calendar-month-cell-34");
        await expect(page.getByTestId("calendar-month-cell-35")).toHaveCount(0);
        const target = page.getByTestId("calendar-month-cell-33");
        await expect(target).toBeVisible();
        await entry.dragTo(target);
    }

    test("moving an entry to another day in month view updates its start date but preserves time-of-day", async ({ page }) => {
        const before = await outlineState(page, scheduledId);
        expect(before.start).toBe(originalStart);
        await moveFromMonthEdge(page);
        await expect.poll(async () => (await outlineState(page, scheduledId)).start, { timeout: 15000 }).toBe(
            expectedStart,
        );
        await page.reload();
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 15000 });
        await expect.poll(async () => (await outlineState(page, scheduledId)).start).toBe(expectedStart);
    });

    test("a drop inside the month grid does not move outline items", async ({ page }) => {
        const before = await outlineState(page, scheduledId);
        expect(before.start).toBe(originalStart);
        await moveFromMonthEdge(page);
        await expect.poll(async () => (await outlineState(page, scheduledId)).start).toBe(expectedStart);
        expect((await outlineState(page, scheduledId)).ids).toEqual(before.ids);
        await page.reload();
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 15000 });
        await expect.poll(async () => (await outlineState(page, scheduledId))).toEqual({
            ids: before.ids,
            start: expectedStart,
        });
    });
});
