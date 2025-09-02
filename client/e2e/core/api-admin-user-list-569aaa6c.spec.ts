/** @feature API-0004
 *  Title   : Admin user list
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("API-0004: admin user list", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    test("invalid token returns error", async ({ page }) => {
        const res = await page.request.post("http://localhost:57000/api/list-users", {
            data: { idToken: "invalid-token" },
        });
        expect(res.status()).toBeGreaterThanOrEqual(400);
    });
    test("missing token returns 400", async ({ page }) => {
        const res = await page.request.post("http://localhost:57000/api/list-users", {
            data: {},
        });
        expect(res.status()).toBe(400);
    });
    test("OPTIONS request returns 204", async ({ page }) => {
        const res = await page.request.fetch("http://localhost:57000/api/list-users", {
            method: "OPTIONS",
        });
        expect(res.status()).toBe(204);
    });
});
