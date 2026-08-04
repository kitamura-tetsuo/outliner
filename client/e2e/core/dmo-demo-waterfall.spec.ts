import { test, expect } from "@playwright/test";

test("Demo loads without waiting for seed API response", async ({ page }) => {
    // Setup context and auth/seed state
    await page.goto("/");
    // Force a seed to ensure the demo is initialized
    await page.request.post("/api/seed-demo");

    // Intercept and heavily delay the validation request
    await page.route("**/api/seed-demo", async route => {
        await new Promise(r => setTimeout(r, 2500));
        await route.continue();
    });

    const start = Date.now();
    await page.goto("/demo");

    // Verify we hit interactive rendered content fast despite the 2.5s simulated delay
    await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 1500 });
    const duration = Date.now() - start;

    // Test fails if we waited on the API (which would be > 2500ms)
    expect(duration).toBeLessThan(1500);
});
