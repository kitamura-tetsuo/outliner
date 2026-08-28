import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-4b1f80e2: The standalone /demo/-/tables/* and /demo/-/calendars/* routes the
// demo sidebar links to must open for a signed-out visitor, matching the inline
// grids on /demo/<page>. Regression guard for issue #4200, where an anonymous
// auth resolution revoked the demo bypass and produced a login wall.
test.describe("Public demo standalone routes", () => {
    test("the demo Sales table opens without signing in", async ({ page }) => {
        await page.goto("/demo/-/tables/demo-table-sales");

        // The Table page shows the Table entity itself: raw rows through the
        // implicit SELECT *, never a Grid presentation (issue #5012).
        const tableView = page.getByTestId("table-entity-view").first();
        await expect(tableView).toBeVisible({ timeout: 30000 });
        await expect(tableView.getByTestId("yjs-table-grid").locator("th", { hasText: "revenue" }))
            .toBeVisible({ timeout: 30000 });

        await expect(page.getByText("Login required")).not.toBeVisible();
        await expect(page.getByText("Please log in to view this table.")).not.toBeVisible();
        await expect(page.getByText("Checking authentication info...")).not.toBeVisible();
        await expect(page.getByText("Public demo / Guest access")).toBeVisible();
    });

    test("the demo Routines table opens without signing in", async ({ page }) => {
        await page.goto("/demo/-/tables/demo-table-routine-templates");

        await expect(page.getByTestId("table-entity-view").first()).toBeVisible({ timeout: 30000 });
        await expect(page.getByText("Please log in to view this table.")).not.toBeVisible();
    });

    test("the project's schedule list opens without signing in", async ({ page }) => {
        await page.goto("/demo/-/schedules");

        await expect(page.getByText("Public demo / Guest access")).toBeVisible({ timeout: 30000 });
        await expect(page.getByText("Please log in.")).not.toBeVisible();
        await expect(page.getByText("Checking authentication info...")).not.toBeVisible();
    });

    // The Table-nested schedule URL is gone as an identity: Schedules are
    // project entities, so the old address only forwards (issue #5012).
    test("the retired table-nested schedule URL forwards to the project schedules", async ({ page }) => {
        await page.goto("/demo/-/tables/demo-table-routine-templates/schedule");

        await expect(page).toHaveURL(/\/demo\/-\/schedules$/, { timeout: 30000 });
        await expect(page.getByText("Public demo / Guest access")).toBeVisible({ timeout: 30000 });
    });

    test("a demo Grid opens on its own page without signing in", async ({ page }) => {
        await page.goto("/demo/-/grids/demo-table-sales-grid");

        const gridView = page.getByTestId("yjs-table-view").first();
        await expect(gridView).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId("grid-source-table-link")).toHaveAttribute(
            "href",
            "/demo/-/tables/demo-table-sales",
        );
        await expect(page.getByText("Public demo / Guest access")).toBeVisible();
    });

    test("the demo project-management landing page opens without signing in", async ({ page }) => {
        await page.goto("/demo/-");

        await expect(page.getByTestId("management-landing-tools")).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId("management-landing-objects")).toBeVisible();
        // Rename/share and import-export operate on data the public demo has
        // neither of, so they stay off its landing page.
        await expect(page.getByTestId("management-landing-settings")).toHaveCount(0);
    });
});

// The dev/E2E environment signs a test user in, so simply visiting these routes
// never exercises the failure this issue is about: Firebase resolving to "no
// user" *after* the page has loaded. Signing out explicitly reproduces what a
// production visitor gets, and is what the checks above cannot see.
test.describe("Public demo standalone routes after signing out", () => {
    /** Signs out through the header menu, the way a visitor would. */
    async function signOut(page: import("@playwright/test").Page): Promise<void> {
        const indicator = page.getByTestId("login-status-indicator");
        await expect(indicator).toHaveAttribute("data-status", "authenticated", { timeout: 30000 });
        await indicator.click();
        await page.getByTestId("user-menu-signout").click();
        await expect(indicator).toHaveAttribute("data-status", "unauthenticated", { timeout: 30000 });
    }

    test("the demo Sales table survives an anonymous auth resolution", async ({ page }) => {
        await page.goto("/demo/-/tables/demo-table-sales");

        const grid = page.getByTestId("yjs-table-grid").first();
        await expect(grid).toBeVisible({ timeout: 30000 });

        await signOut(page);

        await expect(page.getByText("Please log in to view this table.")).toHaveCount(0);
        await expect(page.getByText("Login required")).toHaveCount(0);
        await expect(grid).toBeVisible();
    });

    test("the project's schedule list survives an anonymous auth resolution", async ({ page }) => {
        await page.goto("/demo/-/schedules");

        const banner = page.getByText("Public demo / Guest access");
        await expect(banner).toBeVisible({ timeout: 30000 });

        await signOut(page);

        await expect(page.getByText("Please log in.", { exact: true })).toHaveCount(0);
        await expect(banner).toBeVisible();
    });

    test("a demo schedule rule survives an anonymous auth resolution", async ({ page }) => {
        await page.goto("/demo/-/schedules/demo-rule-daily-routines");

        const tableSelect = page.getByTestId("target-table-select");
        await expect(tableSelect).toBeVisible({ timeout: 30000 });

        await signOut(page);

        await expect(page.getByText("Please log in.", { exact: true })).toHaveCount(0);
        await expect(tableSelect).toBeVisible();
    });

    test("the demo Tasks calendar survives an anonymous auth resolution", async ({ page }) => {
        await page.goto("/demo/-/calendars/demo-calendar-tasks");

        const calendar = page.getByTestId("calendar-view");
        await expect(calendar).toBeVisible({ timeout: 30000 });

        await signOut(page);

        await expect(page.getByText("Please log in to view this calendar.")).toHaveCount(0);
        await expect(calendar).toBeVisible();
    });
});
