import { test, expect } from "@playwright/test";

test("Demo warm load performance latency", async ({ page }) => {
    // Setup context and auth/seed state
    await page.goto("/");
    // Force a seed to ensure the demo is initialized so we measure pure warm latency
    await page.request.post("/api/seed-demo");

    const durations: number[] = [];

    // We execute 10 warm navigations to compute median and p95
    for(let i = 0; i < 10; i++) {
        const start = Date.now();
        await page.goto("/demo");
        // Verify we hit interactive rendered content
        await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 5000 });
        durations.push(Date.now() - start);
        // Navigate away to clear Svelte caches
        await page.goto("/");
    }

    durations.sort((a,b) => a - b);
    const median = durations[Math.floor(durations.length/2)];
    const p95 = durations[Math.floor(durations.length * 0.95)];

    console.log(`Median demo load latency: ${median}ms`);
    console.log(`p95 demo load latency: ${p95}ms`);

    // Test fails if warm load takes longer than 1500ms on median (generous threshold for CI)
    expect(median).toBeLessThan(1500);
});
