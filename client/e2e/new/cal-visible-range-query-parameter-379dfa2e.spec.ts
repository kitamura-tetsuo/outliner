import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-379dfa2e
 *  Title   : Inject the visible range into the calendar query as view.range_start / view.range_end
 *  Source  : docs/client-features/cal-visible-range-query-parameter-379dfa2e.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-379dfa2e: the calendar's visible range is injected into the query", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Range demo item"]);
    });

    test("warns on a query that ignores the range, navigates the window, and stops warning once it is used", async ({ page }) => {
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
        await page.getByTestId("calendar-name-input").first().fill("Range Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        // The initial range label reflects the default (week) view on load.
        const rangeLabel = page.getByTestId("calendar-range-label").first();
        await expect(rangeLabel).toBeVisible({ timeout: 15000 });
        const initialRange = await rangeLabel.textContent();

        // A query that never reads view.range_start/view.range_end warns, but
        // still runs.
        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill(
            "SELECT id, text AS title, due, 'item' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-range-warning").first()).toBeVisible({ timeout: 15000 });

        // Using the overlap idiom makes the warning disappear.
        await queryInput.fill(
            "SELECT id, text AS title, due, 'item' AS source_kind, id AS source_id FROM outline_items"
                + " WHERE due IS NULL OR (due < current_setting('view.range_end')::timestamptz"
                + " AND due >= current_setting('view.range_start')::timestamptz)",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-range-warning")).toHaveCount(0, { timeout: 15000 });

        // Navigating to the next period changes the displayed range and does
        // not error.
        await page.getByTestId("calendar-nav-next").first().click();
        await expect
            .poll(async () => rangeLabel.textContent(), { timeout: 15000 })
            .not.toBe(initialRange);
        await expect(page.getByTestId("calendar-query-error")).toHaveCount(0);

        // "Today" returns to the period containing today.
        await page.getByTestId("calendar-nav-today").first().click();
        await expect
            .poll(async () => rangeLabel.textContent(), { timeout: 15000 })
            .toBe(initialRange);
    });
});
