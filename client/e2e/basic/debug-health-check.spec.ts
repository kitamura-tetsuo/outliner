import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Debug Page Health Check", () => {
    test("should hit local health endpoint", async ({ page }) => {
        // 1. Setup environment and login
        await page.goto("/");
        // Prepare environment (logs in, seeds data)
        await TestHelpers.prepareTestEnvironment(page, test.info(), ["Debug Health Test"], undefined, {
            skipAppReady: true,
        });

        // 2. Visit /debug
        await page.goto("/debug");

        // 3. Wait for UI to be ready
        await expect(page.locator("text=接続ステータス")).toBeVisible({ timeout: 15000 });

        // 4. Click Health Check button and intercept request
        // We verify that the request goes to localhost/127.0.0.1, not the hardcoded external URL
        const [response] = await Promise.all([
            page.waitForResponse(resp => resp.url().includes('/health')),
            page.click("text=ヘルスチェック実行 (GET /health)"),
        ]);

        console.log(`Health check URL: ${response.url()}`);

        // Assertions
        const url = response.url();
        const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

        // Note: This expectation is designed to FAIL if the URL is still hardcoded to the external domain
        expect(isLocal, `Expected local URL but got: ${url}`).toBe(true);
        expect(response.status()).toBe(200);

        // 5. Verify UI update
        // Check that the result is displayed
        await expect(page.locator("text=ステータス: ok")).toBeVisible();
    });
});
