/** @feature FTR-0016 */
import { expect, test } from "@playwright/test";

/**
 * FTR-0016: Verify PORT environment variable is used for Playwright tests
 */

test.describe("FTR-0016: PORT environment variable", () => {
    test("uses provided PORT for server", async ({ page, baseURL }) => {
        const expectedPort = process.env.PORT ?? "7090";
        await expect(baseURL).toContain(expectedPort);
        await page.goto("/");
        await expect(page).toHaveURL(new RegExp(`${expectedPort}`));
        await expect(page.locator("h1")).toContainText("Fluid Outliner App");
    });

    test("baseURL port matches window location", async ({ page, baseURL }) => {
        const expectedPort = process.env.PORT ?? "7090";
        await page.goto("/");
        const locationPort = await page.evaluate(() => window.location.port);
        expect(locationPort).toBe(String(expectedPort));

        const response = await page.request.get(`${baseURL}/api/telemetry-logs`);
        expect(response.status()).toBeGreaterThanOrEqual(200);
        expect(response.status()).toBeLessThan(500);
    });
});
