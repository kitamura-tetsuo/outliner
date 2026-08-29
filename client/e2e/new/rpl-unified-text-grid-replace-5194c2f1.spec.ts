/** @feature FTR-5194c2f1 */
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test(
    "one Replace session replaces a Grid cell, then a text item, through the shared UI",
    async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Find needle in outline", "Grid host"]);
        const hostId = await TestHelpers.getItemIdByIndex(page, 2);
        await page.locator(`.outliner-item[data-item-id="${hostId}"]`).click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").click();
        const grid = page.getByTestId("yjs-table-grid");
        await grid.getByTestId("yjs-table-add-row").click();
        const row = grid.locator("tbody tr").first();
        await expect(row).toBeVisible({ timeout: 30000 });
        await page.waitForTimeout(3000);
        await row.locator('td[data-col="title"] .cell-value').click();
        await row.locator('td[data-col="title"] input.cell-input').fill("needle in Grid");
        await page.keyboard.press("Enter");
        await expect(row).toContainText("needle", { timeout: 30000 });

        await page.getByTestId("search-toggle-button").click();
        await page.getByTestId("search-input").fill("needle");
        await page.getByTestId("search-button").click();
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2");

        // Pick the Grid hit directly from the result list -- combined text+Grid
        // traversal order is covered by FTR-5193's own Find test, so this parks
        // the unified session on the Grid cell without depending on that order.
        await page.getByTestId("search-result-button").filter({ hasText: "needle in Grid" }).click();
        await expect(row.locator('td[data-col="title"]')).toHaveClass(/grid-find-match/);

        await page.getByTestId("replace-input").fill("found");
        await page.getByTestId("replace-button").click();

        // The Grid write routes through the shared Table command layer -- it
        // shows up in the cell without any dialog (writable text, no rename risk).
        await expect(row).toContainText("found in Grid", { timeout: 30000 });

        // The Grid's own query result only refreshes from a debounced PGlite
        // re-query, but the session must not show a hit it just replaced --
        // the count has to drop from the write's own outcome synchronously,
        // not once that debounce catches up.
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 1");

        // Only the outline text item is left; replace it through the very same
        // button, unifying both kinds under one command.
        await page.getByTestId("replace-button").click();
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 0");
        await expect(
            page.locator(".outliner-item .item-text").filter({ hasText: "Find found in outline" }).first(),
        ).toBeVisible();
    },
);
