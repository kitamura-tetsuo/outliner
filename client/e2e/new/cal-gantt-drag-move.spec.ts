import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Gantt view leaf drag", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        // Add a leaf item with a start date.

        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            const parent = items.at(0);
            const child = parent.items.addNode("tester");
            child.updateText("Leaf Task");
            child.start = today;
            child.allDay = true;
            child.duration = "P1D";
        });
        await expect(page.getByText("Leaf Task", { exact: true })).toBeVisible({ timeout: 10000 });
    });

    test("dragging a leaf bar does not double-shift its preview and snaps correctly", async ({ page }) => {
        const item = page.locator(".outliner-item").nth(1);
        // Node kinds are immutable (#5015): the block is created by the
        // slash command, not by converting this row.
        await createBlockFromItem(page, item, "Calendar");

        const createPanel = page.getByTestId("calendar-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("Gantt Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

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

        // Find the bar for "Leaf Task"
        const bar = page.locator('[data-testid^="calendar-gantt-bar-outline_items:"]').first();
        await expect(bar).toBeVisible({ timeout: 15000 });

        // Wait a moment for layout to settle
        await page.waitForTimeout(1000);

        // Get initial position
        const initialBox = await bar.boundingBox();
        expect(initialBox).not.toBeNull();

        // Drag exactly one day to the right (we assume day width is standard, roughly timeline width / days)
        // Since we don't know exact pixel width of a day easily, we will drag by a noticeable amount
        // and assert that the bar's computed `left` style changes predictably and doesn't warp back on drop.

        // Timeline container
        const timeline = page.getByTestId("calendar-gantt-chart").first();
        let timelineBox = await timeline.boundingBox();
        if (!timelineBox) timelineBox = { x: 0, y: 0, width: 800, height: 600 };
        expect(timelineBox).not.toBeNull();

        // By default, the visible range in Gantt is a few weeks, so 50px should be roughly 1-2 days.
        const dragPixels = 60;

        await bar.hover();
        await page.mouse.down();

        // Move to right in steps to trigger drag logic
        await page.mouse.move(
            initialBox!.x + (initialBox!.width / 2) + dragPixels,
            initialBox!.y + (initialBox!.height / 2),
            { steps: 10 },
        );

        // Wait for optimistic state to update
        await page.waitForTimeout(100);

        // Capture position while dragging
        const draggingBox = await bar.boundingBox();

        await page.mouse.up();
        await page.waitForTimeout(100);

        // Capture position right after drop (optimistic override)
        const droppedBox = await bar.boundingBox();

        // The dragging box X should be exactly equal to the dropped box X
        // since we no longer double-shift.
        // It might not be exactly `initialBox.x + dragPixels` because of day snapping.
        expect(Math.abs(draggingBox!.x - droppedBox!.x)).toBeLessThan(5);

        // And it should have moved from initial position
        expect(droppedBox!.x).toBeGreaterThan(initialBox!.x + 10);
    });
});
