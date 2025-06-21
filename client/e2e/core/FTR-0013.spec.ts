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
        // ページが完全に読み込まれるまで待機
        await page.waitForFunction(() => (window as any).testEnvVars !== undefined);

        const config = await page.evaluate(() => {
            const envVars = (window as any).testEnvVars;
            return {
                apiKey: envVars.VITE_FIREBASE_API_KEY,
                projectId: envVars.VITE_FIREBASE_PROJECT_ID,
            };
        });
        expect(config.apiKey).toBeTruthy();
        expect(config.projectId).toBeTruthy();
    });

    test("Token verification URL uses VITE_TOKEN_VERIFY_URL", async ({ page }) => {
        await page.goto("/min");
        // ページが完全に読み込まれるまで待機
        await page.waitForFunction(() => (window as any).testEnvVars !== undefined);

        const url = await page.evaluate(() => {
            const envVars = (window as any).testEnvVars;
            return envVars.VITE_TOKEN_VERIFY_URL;
        });
        expect(url).toBeTruthy();
    });
});
