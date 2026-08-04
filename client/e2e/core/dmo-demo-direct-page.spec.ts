import { test, expect } from "@playwright/test";

test("Demo direct navigation and internal graph navigation", async ({ page }) => {
    // Setup context and auth/seed state
    await page.goto("/");
    // Force a seed to ensure the demo is initialized
    await page.request.post("/api/seed-demo");

    // Test direct navigation to a specific demo page
    await page.goto("/demo/Welcome");
    await expect(page.getByText("Welcome to the Outliner")).toBeVisible();

    // Test navigation to the graph view
    await page.goto("/demo/graph");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15000 });
});
