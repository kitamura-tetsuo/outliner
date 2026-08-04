import { test, expect } from "@playwright/test";

test("SPA navigation does not rerun seed API", async ({ page }) => {
    // Setup context and auth/seed state
    await page.goto("/");
    // Force a seed to ensure the demo is initialized
    await page.request.post("/api/seed-demo");

    await page.goto("/demo");
    await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 15000 });

    let requestCount = 0;
    page.on("request", request => {
        if (request.url().includes("/api/seed-demo") && request.method() === "POST") {
            requestCount++;
        }
    });

    // Navigate using Svelte routing. The link has exactly the page title text "Welcome".
    // We target the a tag that contains "Welcome" in the demo list.
    const link = page.getByRole("link").filter({ hasText: "Welcome" }).first();
    await link.click();

    await expect(page.getByText("Welcome to the Outliner")).toBeVisible({ timeout: 15000 });

    // Assert no extra requests were made
    expect(requestCount).toBe(0);
});
