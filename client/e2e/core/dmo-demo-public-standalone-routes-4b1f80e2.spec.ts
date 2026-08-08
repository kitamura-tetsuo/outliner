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
        await page.goto("/tables/demo/demo-table-sales");

        const grid = page.getByTestId("yjs-table-grid").first();
        await expect(grid).toBeVisible({ timeout: 30000 });

        await signOut(page);

        await expect(page.getByText("Please log in to view this table.")).toHaveCount(0);
        await expect(page.getByText("Login required")).toHaveCount(0);
        await expect(grid).toBeVisible();
    });

    test("the demo table's schedule list survives an anonymous auth resolution", async ({ page }) => {
        await page.goto("/tables/demo/demo-table-routine-templates/schedule");

        const banner = page.getByText("Public demo / Guest access");
        await expect(banner).toBeVisible({ timeout: 30000 });

        await signOut(page);

        await expect(page.getByText("Please log in.", { exact: true })).toHaveCount(0);
        await expect(banner).toBeVisible();
    });

    test("a demo schedule rule survives an anonymous auth resolution", async ({ page }) => {
        await page.goto("/schedules/demo/demo-rule-daily-routines");

        const tableSelect = page.getByTestId("target-table-select");
        await expect(tableSelect).toBeVisible({ timeout: 30000 });

        await signOut(page);

        await expect(page.getByText("Please log in.", { exact: true })).toHaveCount(0);
        await expect(tableSelect).toBeVisible();
    });

    test("the demo Tasks calendar survives an anonymous auth resolution", async ({ page }) => {
        await page.goto("/calendars/demo/demo-calendar-tasks");

        const calendar = page.getByTestId("calendar-view");
        await expect(calendar).toBeVisible({ timeout: 30000 });

        await signOut(page);

        await expect(page.getByText("Please log in to view this calendar.")).toHaveCount(0);
        await expect(calendar).toBeVisible();
    });
});
