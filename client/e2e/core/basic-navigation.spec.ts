import { expect, test } from "@playwright/test";

test.describe("Basic Navigation Debug", () => {
    test("can navigate to home page", async ({ page }) => {
        console.log("Debug: Starting basic navigation test");
        console.log("Debug: Page URL before navigation:", page.url());

        try {
            console.log("Debug: Attempting to navigate to /");
            await page.goto("/", {
                timeout: 120000,
                waitUntil: "domcontentloaded",
            });
            console.log("Debug: Successfully navigated to home page");
            console.log("Debug: Page URL after navigation:", page.url());

            // ページタイトルを確認
            const title = await page.title();
            console.log("Debug: Page title:", title);

            // ページが読み込まれたことを確認
            await expect(page).toHaveURL(/.*localhost:7090.*/);
        } catch (error) {
            console.error("Debug: Navigation failed:", error);
            console.log("Debug: Current page URL:", page.url());
            throw error;
        }
    });

    test("can access server directly", async ({ page }) => {
        console.log("Debug: Testing direct server access");

        try {
            await page.goto("http://localhost:7090/", {
                timeout: 120000,
                waitUntil: "domcontentloaded",
            });
            console.log("Debug: Direct server access successful");

            const title = await page.title();
            console.log("Debug: Page title:", title);
        } catch (error) {
            console.error("Debug: Direct server access failed:", error);
            throw error;
        }
    });
});
import "../utils/registerAfterEachSnapshot";
