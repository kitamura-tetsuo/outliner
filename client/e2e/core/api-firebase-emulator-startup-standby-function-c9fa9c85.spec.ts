/** @feature API-0002
 *  Title   : Firebase emulator起動待機機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

// Utility function to retry request until success or timeout
async function waitForHealth(request: any, attempts = 10) {
    for (let i = 0; i < attempts; i++) {
        try {
            const response = await request.get("http://localhost:57000/health");

            if (response.ok()) {
                return response;
            }
        } catch (error) {
            console.log(`Attempt ${i + 1}/${attempts} failed:`, error instanceof Error ? error.message : String(error));
        }
        await new Promise(res => setTimeout(res, 1000));
    }
    throw new Error("Health endpoint did not respond in time");
}

test.describe("API-0002: emulator wait-and-retry", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    test("server becomes available after retries", async ({ page }) => {
        const response = await waitForHealth(page.request, 15);
        expect(response.status()).toBe(200);

        const json = await response.json();
        expect(json.status).toBe("OK");
    });
});
