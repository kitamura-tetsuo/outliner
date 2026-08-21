import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

/** @feature CMD-0044
 *  Title   : Calendar settings (query, timezone, roles) should be collapsible behind a toggle
 *  Source  : docs/client-features/cal-settings-panel-toggle-CMD-0044.yaml
 */
test.describe("Calendar Settings Panel Toggle", () => {
    test(
        "seed a calendar, assert calendar-query-input is not visible initially, click toggle, assert visible and writes through",
        async ({
            page,
        }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar demo item"]);

            const item = page.locator(".outliner-item").nth(1);
            // Node kinds are immutable (#5015): the block is created by the
            // slash command, not by converting this row.
            await createBlockFromItem(page, item, "Calendar");

            const createPanel = page.getByTestId("calendar-create-panel").first();
            await expect(createPanel).toBeVisible({ timeout: 10000 });
            await page.getByTestId("calendar-name-input").first().fill("Test Calendar");
            await page.getByTestId("calendar-create").first().click();

            // The view mounts (PGlite loads lazily, so allow generous time).
            const view = page.getByTestId("calendar-view").first();
            await expect(view).toBeVisible({ timeout: 15000 });

            // Assert calendar-query-input is visible initially because the query is empty
            await expect(page.getByTestId("calendar-query-input")).toBeVisible();

            // Let's set a non-empty query.
            await page.getByTestId("calendar-query-input").fill(
                "SELECT id, text AS title, all_day, start_on, 'item' AS source_kind, id AS source_id FROM outline_items",
            );
            await page.getByTestId("calendar-query-input").blur();

            // Wait for the query to be saved to Yjs and PGlite to process it.
            await page.waitForTimeout(1000);

            // Now, if we refresh the page, it should be collapsed by default.
            await page.reload();

            // Wait for it to render
            await expect(page.getByTestId("calendar-view")).toBeVisible({ timeout: 15000 });

            // Assert calendar-query-input is not visible initially since it has a query
            await expect(page.getByTestId("calendar-query-input")).toBeHidden({ timeout: 10000 });

            // Click calendar-toggle-settings
            await page.getByTestId("calendar-toggle-settings").click();

            // Assert it is visible
            await expect(page.getByTestId("calendar-query-input")).toBeVisible();

            // Write through (change the query, assert the grid re-queries)
            await page.getByTestId("calendar-query-input").fill(
                "SELECT id, text AS title, all_day, start_on, 'item' AS source_kind, id AS source_id FROM outline_items WHERE 1=0",
            );
            await page.getByTestId("calendar-query-input").blur();

            // No items should be rendered
            await expect(page.locator(".timed-entry")).toHaveCount(0);
        },
    );
});
