import { expect, test } from "@playwright/test";

test.describe("Browser Basic Test", () => {
    test("can create a page", async ({ page }) => {
        console.log("Debug: Testing basic page creation");

        // ページが作成されたことを確認
        expect(page).toBeDefined();
        console.log("Debug: Page created successfully");

        // ページのURLを確認
        console.log("Debug: Initial page URL:", page.url());

        // 基本的なページ操作をテスト
        await page.setContent("<html><body><h1>Test Page</h1></body></html>");
        console.log("Debug: Content set successfully");

        const title = await page.locator("h1").textContent();
        console.log("Debug: Page title:", title);
        expect(title).toBe("Test Page");
    });

    test("can navigate to external site", async ({ page }) => {
        console.log("Debug: Testing external navigation");

        try {
            await page.goto("http://example.com", {
                timeout: 30000,
                waitUntil: "domcontentloaded",
            });
            console.log("Debug: Successfully navigated to example.com");

            const title = await page.title();
            console.log("Debug: External page title:", title);
        } catch (error) {
            console.error("Debug: External navigation failed:", error);
            throw error;
        }
    });
});
import "../utils/registerAfterEachSnapshot";
