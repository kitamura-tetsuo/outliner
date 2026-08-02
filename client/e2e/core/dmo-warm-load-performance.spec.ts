import { expect, test } from "@playwright/test";

test.describe("Demo warm load performance", () => {
    test("does not block Yjs connection on warm seed validation", async ({ page }) => {
        // Pre-seed demo
        await page.goto("/demo");
        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 15000 });

        // Wait for connection to settle
        await page.waitForTimeout(2000);

        // Intercept seed-demo API and delay it
        let seedRequestResponded = false;
        await page.route("**/api/seed-demo", async (route) => {
            if (route.request().method() === "POST") {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                seedRequestResponded = true;
                await route.continue();
            } else {
                await route.continue();
            }
        });

        // Navigate again
        await page.goto("/demo");

        const startTime = Date.now();
        const newPageList = page.getByTestId("demo-page-list");

        // Wait for page list to appear
        await expect(newPageList).toBeVisible({ timeout: 15000 });

        const elapsed = Date.now() - startTime;

        // Ensure the list appeared BEFORE the delayed seed request finished
        expect(seedRequestResponded).toBe(false);

        // Typically a warm load should be fast, like < 1000ms
        expect(elapsed).toBeLessThan(3000);
    });
});
