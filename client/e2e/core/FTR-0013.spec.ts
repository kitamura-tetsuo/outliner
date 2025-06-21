import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-0013: Use environment variables in min page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Firebase config values come from environment variables", async ({ page }) => {
        await page.goto("/min");
        const config = await page.evaluate(() => ({
            apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY,
            projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID,
        }));
        expect(config.apiKey).toBeTruthy();
        expect(config.projectId).toBeTruthy();
    });

    test("Token verification URL uses VITE_TOKEN_VERIFY_URL", async ({ page }) => {
        await page.goto("/min");
        const url = await page.evaluate(() => (import.meta as any).env.VITE_TOKEN_VERIFY_URL);
        expect(url).toBeTruthy();
    });
});
