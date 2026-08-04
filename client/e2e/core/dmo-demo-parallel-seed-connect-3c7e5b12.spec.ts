import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-3c7e5b12: freshness validation and the demo Yjs connection must run in
// parallel. A slow no-reset /api/seed-demo response must not delay the content.
const SEED_DELAY_MS = 8000;

test.describe("Demo seed validation runs in parallel with the Yjs connection", () => {
    test.setTimeout(120000);

    test("the demo page list appears before a delayed no-reset seed response", async ({ page }) => {
        // Warm visit first, so the delayed request below is a genuine no-reset one.
        await page.goto("/demo");
        await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 60000 });
        await expect(page.getByTestId("demo-page-list").getByText("Welcome", { exact: true }).first())
            .toBeVisible({ timeout: 30000 });

        let seedResponseAt = 0;
        await page.route("**/api/seed-demo", async (route) => {
            await new Promise(resolve => setTimeout(resolve, SEED_DELAY_MS));
            seedResponseAt = Date.now();
            await route.continue();
        });

        const started = Date.now();
        await page.goto("/demo");
        await expect(page.getByTestId("demo-page-list").getByText("Welcome", { exact: true }).first())
            .toBeVisible({ timeout: 30000 });
        const contentAt = Date.now();

        // The content must be on screen well before the seed request answers.
        expect(contentAt - started).toBeLessThan(SEED_DELAY_MS);
        expect(seedResponseAt).toBe(0);
    });

    test("a delayed seed response does not block a direct /demo/[page] visit", async ({ page }) => {
        await page.goto("/demo");
        await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 60000 });

        await page.route("**/api/seed-demo", async (route) => {
            await new Promise(resolve => setTimeout(resolve, SEED_DELAY_MS));
            await route.continue();
        });

        const started = Date.now();
        await page.goto("/demo/Welcome");
        await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 30000 });
        expect(Date.now() - started).toBeLessThan(SEED_DELAY_MS);
    });
});
