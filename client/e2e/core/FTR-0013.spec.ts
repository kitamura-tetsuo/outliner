import {
    expect,
    test,
} from "@playwright/test";

test.describe("FTR-0013: Use environment variables in min page", () => {
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
        const response = await page.goto("/min");
        expect(response?.status()).toBe(200);

        // ページが表示されることを確認
        await expect(page.locator("body")).toBeVisible();
        await expect(page.locator("h1")).toContainText("Firebase Google Login");
    });

    test("Environment variables configuration is correct", async ({ page }) => {
        // 環境変数の値をテスト
        const apiKey = process.env.VITE_FIREBASE_API_KEY;
        const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
        const tokenVerifyUrl = process.env.VITE_TOKEN_VERIFY_URL;

        expect(apiKey).toBe("test-api-key");
        expect(projectId).toBe("test-project-id");
        expect(tokenVerifyUrl).toBe("http://localhost:7091/verify");

        // 基本的なページアクセス確認
        await page.goto("/");
        await expect(page.locator("body")).toBeVisible();
    });
});
