/** @feature FTR-0017 */
import {
    expect,
    test,
} from "@playwright/test";

/**
 * FTR-0017: Ensure server and API use the configured PORT
 */

test.describe("FTR-0017: PORT configuration", () => {
    const expectedPort = process.env.PORT ?? "7090";

    test("server responds on configured port", async ({ page, baseURL }) => {
        await page.goto("/");
        const locationPort = await page.evaluate(() => window.location.port);
        expect(locationPort).toBe(String(expectedPort));

        expect(baseURL).toContain(expectedPort);
        const response = await page.request.get(`${baseURL}/api/telemetry-logs`);
        expect(response.status()).toBeGreaterThanOrEqual(200);
        expect(response.status()).toBeLessThan(500);
    });
});
