import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-e3a9f2b1
 *  Title   : Destination date tooltip while dragging a Gantt bar
 *  Source  : docs/client-features/cal-gantt-view-e3a9f2b1.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-e3a9f2b1: Gantt drag destination tooltip", () => {
    /** The dated leaf added under the anchor — the row whose bar is dragged. */
    let leafItemId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        leafItemId = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            const child = items.at(0).items.addNode("tester");
            child.updateText("Leaf Task");
            child.start = today;
            child.allDay = true;
            child.duration = "P1D";
            return String(child.id);
        });
        await expect(page.getByText("Leaf Task", { exact: true })).toBeVisible({ timeout: 10000 });
    });

    test("dragging a bar shows the day-snapped destination date and clears it on drop", async ({ page }) => {
        const item = page.locator(`.outliner-item[data-item-id="${leafItemId}"]`);
        await expect(item).toBeVisible({ timeout: 10000 });
        await item.click();
        await page.waitForTimeout(300);
        await item.click({ button: "right" });
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible({ timeout: 10000 });
        await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

        await expect(page.getByTestId("calendar-create-panel").first()).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("Gantt Tooltip Calendar");
        await page.getByTestId("calendar-create").first().click();
        await expect(page.getByTestId("calendar-view").first()).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill(
            "SELECT id, text AS title, due, all_day, start_at, start_on, duration, parent_id, "
                + "'outline_items' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_on");
        await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
        await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");

        await page.getByTestId("calendar-view-type").first().selectOption("gantt");
        await expect(page.getByTestId("calendar-gantt-chart").first()).toBeVisible({ timeout: 15000 });

        const bar = page.locator('[data-testid^="calendar-gantt-bar-outline_items:"]').first();
        await expect(bar).toBeVisible({ timeout: 15000 });
        const tooltip = page.getByTestId("calendar-drag-tooltip");
        await expect(tooltip).toHaveCount(0);

        await bar.hover();
        const box = await bar.boundingBox();
        if (!box) throw new Error("Bar box missing");
        await page.mouse.down();
        await page.mouse.move(box.x + (box.width / 2) + 60, box.y + (box.height / 2), { steps: 10 });

        // A Gantt drag snaps to whole days, so the label is a date with no
        // time-of-day at all.
        await expect(tooltip).toBeVisible({ timeout: 10000 });
        await expect(tooltip).toHaveText(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/);

        await page.mouse.up();
        await expect(tooltip).toHaveCount(0, { timeout: 10000 });
    });
});
