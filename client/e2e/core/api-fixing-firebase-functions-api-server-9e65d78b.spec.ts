/** @feature API-0001
 *  Title   : Firebase Functions APIサーバーの修正
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("API-0001: Firebase Functions CORS and token validation", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    test("OPTIONS preflight returns 204", async ({ page }) => {
        const response = await page.request.fetch("http://localhost:57000/api/fluidToken", {
            method: "OPTIONS",
        });
        expect(response.status()).toBe(204);
    });
    test("invalid token returns authentication error", async ({ page }) => {
        const response = await page.request.post("http://localhost:57000/api/fluidToken", {
            data: { idToken: "invalid" },
        });
        expect(response.status()).toBe(401);

        const body = await response.json();
        expect(body.error).toBe("Authentication failed");
    });
    test("save-container with invalid token returns error", async ({ page }) => {
        const response = await page.request.post("http://localhost:57000/api/save-container", {
            data: { idToken: "invalid", containerId: "test" },
        });
        expect(response.status()).toBe(500);

        const body = await response.json();
        expect(body.error).toBe("Failed to save container ID");
    });
});
