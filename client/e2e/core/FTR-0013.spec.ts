/** @feature FTR-0013
 *  Title   : Use environment variables in min page
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-0013: min page uses environment variables", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Firebase config values come from environment variables", async ({ page }) => {
        await page.goto("/min");
        const apiKey = await page.evaluate(() => import.meta.env.VITE_FIREBASE_API_KEY);
        expect(apiKey).toBe(process.env.VITE_FIREBASE_API_KEY);
        const verifyUrl = await page.evaluate(() => import.meta.env.VITE_TOKEN_VERIFY_URL);
        expect(verifyUrl).toBe(process.env.VITE_TOKEN_VERIFY_URL);
    });

    test("Sign in button is visible", async ({ page }) => {
        await page.goto("/min");
        const button = page.locator("button");
        await expect(button).toBeVisible();
    });
});
