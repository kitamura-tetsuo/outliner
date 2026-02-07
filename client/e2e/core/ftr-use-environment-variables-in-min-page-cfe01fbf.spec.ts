import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-0013
 *  Title   : Use environment variables in min page
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-0013: Use environment variables in min page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], undefined, {
            skipSeed: true,
            doNotNavigate: true,
            skipAppReady: true,
        });
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

    test("Environment variables are available in test environment", async ({ page }) => {
        // Node.js環境での環境変数テスト
        expect(process.env.VITE_FIREBASE_API_KEY).toBeTruthy();
        expect(process.env.VITE_FIREBASE_PROJECT_ID).toBeTruthy();
        expect(process.env.VITE_TOKEN_VERIFY_URL).toBeTruthy();

        // ページアクセスのテスト
        await page.goto("/");
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("body")).toBeVisible();
    });

    test("Min page can be accessed", async ({ page }) => {
        // /minページへのアクセステスト
        await page.goto("/min");
        await expect(page).toHaveURL("/min");

        // ページが表示されることを確認
        await expect(page.locator("body")).toBeVisible();
        await expect(page.locator("h1")).toContainText("Firebase Google Login");
    });

    test("Environment variables configuration is correct", async ({ page }) => {
        // 環境変数の値をテスト
        const apiKey = process.env.VITE_FIREBASE_API_KEY;
        const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
        const tokenVerifyUrl = process.env.VITE_TOKEN_VERIFY_URL;

        expect(apiKey).toBe("AIzaSyCMPfoobar1234567890abcdefghij");
        expect(projectId).toBe("outliner-d57b0");
        expect(tokenVerifyUrl).toMatch(/http:\/\/(localhost|127\.0\.0\.1):7091\/verify/);

        // 基本的なページアクセス確認
        await page.goto("/");
        await expect(page.locator("body")).toBeVisible();
    });
});
