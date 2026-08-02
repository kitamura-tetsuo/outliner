import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

test("Demo content loads without waiting for seed response", async ({ page }) => {
    // Block/Delay seed-demo
    await page.route("**/api/seed-demo", async (route) => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        route.continue();
    });

    const startTime = Date.now();
    await page.goto("/demo");

    // Content should be visible BEFORE the 5000ms delay finishes
    await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 4000 });
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(4500);
});
