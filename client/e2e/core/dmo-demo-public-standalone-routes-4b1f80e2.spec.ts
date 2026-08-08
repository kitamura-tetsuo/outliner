import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-4b1f80e2: The standalone /tables/demo/* and /calendars/demo/* routes the
// demo sidebar links to must open for a signed-out visitor, matching the inline
// grids on /demo/<page>. Regression guard for issue #4200, where an anonymous
// auth resolution revoked the demo bypass and produced a login wall.
test.describe("Public demo standalone routes", () => {
    test("the demo Sales table opens without signing in", async ({ page }) => {
        await page.goto("/tables/demo/demo-table-sales");

        const tableView = page.getByTestId("yjs-table-view").first();
        await expect(tableView).toBeVisible({ timeout: 30000 });
        await expect(tableView.getByTestId("yjs-table-grid").locator("th", { hasText: "revenue" }))
            .toBeVisible({ timeout: 30000 });

        await expect(page.getByText("Login required")).not.toBeVisible();
        await expect(page.getByText("Please log in to view this table.")).not.toBeVisible();
        await expect(page.getByText("Checking authentication info...")).not.toBeVisible();
        await expect(page.getByText("Public demo / Guest access")).toBeVisible();
    });

    test("the demo Routines table opens without signing in", async ({ page }) => {
        await page.goto("/tables/demo/demo-table-routine-templates");

        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 30000 });
        await expect(page.getByText("Please log in to view this table.")).not.toBeVisible();
    });

    test("the demo table's schedule list opens without signing in", async ({ page }) => {
        await page.goto("/tables/demo/demo-table-routine-templates/schedule");

        await expect(page.getByText("Public demo / Guest access")).toBeVisible({ timeout: 30000 });
        await expect(page.getByText("Please log in.")).not.toBeVisible();
        await expect(page.getByText("Checking authentication info...")).not.toBeVisible();
    });
});
