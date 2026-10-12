/** @feature RTE-5a93f2c1
 *  Title   : Route parameters and query state follow client-side navigation
 *  Source  : docs/client-features/rte-route-state-follows-navigation-5a93f2c1.yaml
 */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// Route components read their parameters from SvelteKit's reactive `$app/state`
// (since SvelteKit 3 replaced `$app/stores`). SvelteKit reuses a mounted route
// component when only its parameters change, so a value captured once instead
// of derived from `page` would keep showing the previous resource. These checks
// drive the public demo through the router itself: link clicks and history
// traversal, never a full document reload between the compared states.
test.describe("RTE-5a93f2c1: demo management routes follow navigation", () => {
    test("the table page follows a [tableId] change made by history traversal", async ({ page }) => {
        await page.goto("/demo/-/tables");

        const list = page.getByTestId("project-table-list");
        await expect(list).toBeVisible({ timeout: 30000 });
        const heading = page.getByRole("heading", { level: 1 });

        await list.locator('a[data-table-id="demo-table-sales"]').click();
        await expect(page).toHaveURL(/\/demo\/-\/tables\/demo-table-sales$/);
        await expect(heading).toHaveText("Sales", { timeout: 30000 });

        await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Tables" }).click();
        await expect(page).toHaveURL(/\/demo\/-\/tables$/);
        await list.locator('a[data-table-id="demo-table-tasks"]').click();
        await expect(page).toHaveURL(/\/demo\/-\/tables\/demo-table-tasks$/);
        await expect(heading).toHaveText("Tasks", { timeout: 30000 });

        // Jump straight from the Tasks table back to the Sales table: the same
        // [tableId] route component, only its parameter changes.
        await page.evaluate(() => history.go(-2));
        await expect(page).toHaveURL(/\/demo\/-\/tables\/demo-table-sales$/);
        await expect(heading).toHaveText("Sales", { timeout: 30000 });
    });

    test("the Object Manager applies the ?selected= query of the route", async ({ page }) => {
        await page.goto("/demo/-/objects?selected=demo-table-tasks");

        await expect(page.getByTestId("object-manager-selected-count")).toHaveText("1 selected", { timeout: 30000 });
        await expect(
            page.getByTestId("object-row-demo-table-tasks").locator('td.checkbox-col input[type="checkbox"]'),
        ).toBeChecked();
        await expect(
            page.getByTestId("object-row-demo-table-sales").locator('td.checkbox-col input[type="checkbox"]'),
        ).not.toBeChecked();
    });
});
