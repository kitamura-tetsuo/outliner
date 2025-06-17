/** @feature FTR-0013
 *  Title   : Use environment variables in min page
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Min page environment variables", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
    });

    test("uses values from import.meta.env", async ({ page }) => {
        await page.goto("/min");
        await expect(page.locator("button")).toBeVisible();
        const envValues = await page.evaluate(() => {
            return {
                apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
                verifyUrl: import.meta.env.VITE_TOKEN_VERIFY_URL,
            };
        });
        expect(envValues.apiKey).toBe(process.env.VITE_FIREBASE_API_KEY);
        expect(envValues.verifyUrl).toBe(process.env.VITE_TOKEN_VERIFY_URL);
    });
});
