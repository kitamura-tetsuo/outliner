import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-7d3e9a1c: The public /demo route shows the demo project (page list of
// feature demo pages) instead of a single page, without requiring login.
test.describe("Demo project feature tour", () => {
    test("the demo route shows the demo project's page list", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });

        for (
            const title of [
                "Welcome",
                "Formatting",
                "Outliner Basics",
                "Undo and Redo",
                "Internal Links",
                "Schedule Rules",
                "Search and Commands",
                "Selection and Clipboard",
                "Collaboration",
                "Comments and Votes",
                "Publishing and Sharing",
                "Advanced Features",
                "Tasks and Habits",
                "Recurring Tasks",
                "Calendars",
            ]
        ) {
            await expect(pageList.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 15000 });
        }
    });

    test("selecting a page opens it inside the demo project", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });

        await pageList.getByText("Formatting", { exact: true }).first().click();

        await expect(page).toHaveURL(/\/demo\/Formatting$/, { timeout: 15000 });
        await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByText("This page demonstrates text formatting", { exact: false }).first(),
        ).toBeVisible({ timeout: 30000 });
    });

    test("the Advanced Features page renders the seeded Sales database table", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });
        await pageList.getByText("Advanced Features", { exact: true }).first().click();

        await expect(page).toHaveURL(/\/demo\/Advanced%20Features$/, { timeout: 15000 });

        const salesTable = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-name").getByText("Sales", { exact: true }),
        }).first();
        await expect(salesTable).toBeVisible({ timeout: 30000 });
        await expect(salesTable.getByTestId("yjs-table-grid")).toBeVisible({ timeout: 30000 });
        await expect(salesTable.getByTestId("yjs-table-grid").locator("th", { hasText: "revenue" })).toBeVisible();
    });

    test("the Publishing and Sharing page renders the seeded links", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });
        await pageList.getByText("Publishing and Sharing", { exact: true }).first().click();

        await expect(page).toHaveURL(/\/demo\/Publishing%20and%20Sharing$/, { timeout: 15000 });
        await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 30000 });

        const scheduleText = page.getByText("lists upcoming publishing tasks");
        await expect(scheduleText).toBeVisible({ timeout: 30000 });

        const diffText = page.getByText("snapshot diff viewer");
        await expect(diffText).toBeVisible({ timeout: 30000 });
    });

    test("the Tasks and Habits page renders the seeded Tasks and Habits database tables", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });
        await pageList.getByText("Tasks and Habits", { exact: true }).first().click();

        await expect(page).toHaveURL(/\/demo\/Tasks%20and%20Habits$/, { timeout: 15000 });

        const tasksTable = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-name").getByText("Tasks", { exact: true }),
        }).first();
        await expect(tasksTable).toBeVisible({ timeout: 30000 });
        await expect(tasksTable.getByTestId("yjs-table-grid").locator("th", { hasText: "title" })).toBeVisible({
            timeout: 30000,
        });

        const habitsTable = page.getByTestId("yjs-table-view").filter({
            has: page.getByTestId("yjs-table-name").getByText("Habits", { exact: true }),
        }).first();
        await expect(habitsTable).toBeVisible({ timeout: 30000 });
        await expect(habitsTable.getByTestId("yjs-table-grid").locator("th", { hasText: "name" })).toBeVisible({
            timeout: 30000,
        });
    });

    test("surfaces connection problem quickly when backend is unreachable", async ({ page }) => {
        // Block the seed request to simulate network failure
        await page.route("**/api/seed-demo", async (route) => {
            await route.abort("failed");
        });

        const startTime = Date.now();
        await page.goto("/demo");

        // Should show the error quickly (well within 5 seconds), not waiting 30s
        const errorText = page.getByText("Can't reach the demo server — retrying...", { exact: false });
        await expect(errorText).toBeVisible({ timeout: 5000 });

        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeLessThan(10000); // Verify it didn't wait the full timeout
    });
});
