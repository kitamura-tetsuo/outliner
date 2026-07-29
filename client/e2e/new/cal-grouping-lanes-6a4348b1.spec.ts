import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-6a4348b1
 *  Title   : Grouping lanes with writability-gated drops
 *  Source  : docs/client-features/cal-grouping-lanes-6a4348b1.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-6a4348b1: grouping lanes", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Work item", "Urgent item"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            items.at(1).start = `${today}T09:00:00.000Z`;
            items.at(1).allDay = false;
            items.at(1).duration = "PT30M";
            items.at(1).addTag("work");
            items.at(2).start = `${today}T11:00:00.000Z`;
            items.at(2).allDay = false;
            items.at(2).duration = "PT30M";
            items.at(2).addTag("urgent");
        });
    });

    async function createCalendarGroupedByTags(page: import("@playwright/test").Page) {
        // .outliner-item.first() is the page title row, whose context menu is
        // a no-op (handleContextMenu returns early for isPageTitle); use the
        // seeded item below it instead.
        const item = page.locator(".outliner-item").nth(1);
        await item.click({ button: "right" });
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible({ timeout: 10000 });
        await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

        const createPanel = page.getByTestId("calendar-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("Lanes Calendar");
        await page.getByTestId("calendar-create").first().click();
        await expect(page.getByTestId("calendar-view").first()).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill(
            "SELECT id, text AS title, all_day, start_at, duration, tags, "
                + "'outline_items' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
        await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
        await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");
        await page.getByTestId("calendar-group-axis-tags").first().check();
    }

    test("groups entries into tag swimlanes and drags one between lanes", async ({ page }) => {
        await createCalendarGroupedByTags(page);

        await expect(page.getByTestId("calendar-lane-time-grid").first()).toBeVisible({ timeout: 15000 });
        const workLane = page.getByTestId("calendar-lane-work").first();
        const urgentLane = page.getByTestId("calendar-lane-urgent").first();
        await expect(workLane).toBeVisible({ timeout: 15000 });
        await expect(urgentLane).toBeVisible({ timeout: 15000 });

        // toContainText, not toHaveText: the entry also renders the lane-drag
        // handle ("⠿") as sibling text content.
        const workEntry = workLane.locator('[data-testid^="calendar-entry-outline_items:"]').first();
        await expect(workEntry).toContainText("Work item");
        const urgentEntry = urgentLane.locator('[data-testid^="calendar-entry-outline_items:"]').first();
        await expect(urgentEntry).toContainText("Urgent item");

        // Drag the "Work item" entry's lane handle onto the urgent lane's
        // header. Targeting the header (rather than the whole, scrollable lane
        // band) gives Playwright an unambiguous drop point. Dispatch each
        // HTML5 event in its own browser task so Svelte processes drag state
        // between events; one synchronous page.evaluate sequence can collapse
        // the delegated handlers. A plain drop replaces the item's tag set.
        const workHandle = workEntry.locator('[data-testid^="calendar-entry-lane-handle-outline_items:"]');
        const urgentHeader = page.getByTestId("calendar-lane-header-urgent").first();
        await expect(workHandle).toBeVisible();
        await expect(urgentHeader).toBeVisible();
        const entryTestId = await workEntry.getAttribute("data-testid");
        expect(entryTestId).toBeTruthy();
        const entryKey = entryTestId!.replace("calendar-entry-", "");
        const dataTransfer = await page.evaluateHandle((key) => {
            const transfer = new DataTransfer();
            // Seed the standard payload explicitly. This also verifies the
            // drop target's recovery path if a redraw loses local drag state.
            transfer.setData("text/plain", key);
            return transfer;
        }, entryKey);
        await workHandle.dispatchEvent("dragstart", { dataTransfer });
        await urgentHeader.dispatchEvent("dragenter", { dataTransfer });
        await urgentHeader.dispatchEvent("dragover", { dataTransfer });
        await urgentHeader.dispatchEvent("drop", { dataTransfer });
        await workHandle.dispatchEvent("dragend", { dataTransfer });

        // Verify the authoritative collaboration data rather than racing the
        // asynchronous Yjs -> PGlite projection used to redraw the lanes.
        // The initial assertions above cover lane rendering; this assertion
        // proves that the drop performed the writable, replace-mode update.
        await page.waitForFunction(
            () => {
                const item = (globalThis as any).generalStore.currentPage.items.at(1);
                return item.tags.length === 1 && item.tags[0] === "urgent";
            },
            undefined,
            { timeout: 15000 },
        );
        await expect(page.getByTestId("calendar-write-error")).toHaveCount(0);
    });

    test("a lane backed by a non-writable column shows no drag handle", async ({ page }) => {
        // .outliner-item.first() is the page title row, whose context menu is
        // a no-op (handleContextMenu returns early for isPageTitle); use the
        // seeded item below it instead.
        const item = page.locator(".outliner-item").nth(1);
        await item.click({ button: "right" });
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible({ timeout: 10000 });
        await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

        const createPanel = page.getByTestId("calendar-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("Read-only Lanes");
        await page.getByTestId("calendar-create").first().click();
        await expect(page.getByTestId("calendar-view").first()).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        // A CASE expression has no writable origin — its lane must offer no
        // drag handle even though the entry itself is otherwise addressable.
        await queryInput.fill(
            "SELECT id, text AS title, all_day, start_at, duration, "
                + "CASE WHEN tags LIKE '%work%' THEN 'work' ELSE 'other' END AS bucket, "
                + "'outline_items' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
        await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
        await page.getByTestId("calendar-group-axis-bucket").first().check();

        await expect(page.getByTestId("calendar-lane-time-grid").first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-testid^="calendar-entry-lane-handle-"]')).toHaveCount(0, { timeout: 15000 });
    });
});
