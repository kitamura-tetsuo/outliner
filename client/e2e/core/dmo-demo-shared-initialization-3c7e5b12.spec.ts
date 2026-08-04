import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-3c7e5b12: /demo, /demo/[page] and /demo/graph share one initialization
// workflow, so Svelte-managed navigation inside the demo reuses the synced
// project client instead of repeating the seed/connect waterfall.
test.describe("Demo routes share one initialization workflow", () => {
    test.setTimeout(120000);

    test("direct navigation to /demo/Welcome opens the page", async ({ page }) => {
        await page.goto("/demo/Welcome");

        await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 60000 });
        await expect(page.getByText("Welcome to the Outliner Demo!", { exact: false }).first())
            .toBeVisible({ timeout: 30000 });
    });

    test("direct navigation to /demo/graph renders the graph view", async ({ page }) => {
        await page.goto("/demo/graph");

        await expect(page.locator(".graph-view")).toBeVisible({ timeout: 60000 });
    });

    test("moving between demo pages issues no extra seed request", async ({ page }) => {
        let seedRequests = 0;
        await page.route("**/api/seed-demo", async (route) => {
            seedRequests++;
            await route.continue();
        });

        await page.goto("/demo");
        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 60000 });
        await expect(pageList.getByText("Formatting", { exact: true }).first()).toBeVisible({ timeout: 30000 });

        const afterInitialLoad = seedRequests;
        expect(afterInitialLoad).toBeGreaterThan(0);

        // Svelte-managed navigation between demo pages.
        await pageList.getByText("Formatting", { exact: true }).first().click();
        await expect(page).toHaveURL(/\/demo\/Formatting$/, { timeout: 15000 });
        await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 30000 });

        await page.getByTestId("graph-view-button").click();
        await expect(page).toHaveURL(/\/demo\/graph$/, { timeout: 15000 });
        await expect(page.locator(".graph-view")).toBeVisible({ timeout: 30000 });

        expect(seedRequests).toBe(afterInitialLoad);
    });
});
