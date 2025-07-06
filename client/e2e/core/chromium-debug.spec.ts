import { chromium, expect, test } from "@playwright/test";

test.describe("Chromium Debug Test", () => {
    test("can launch browser and create context", async () => {
        console.log("Debug: Starting browser launch test");

        const browser = await chromium.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-web-security",
                "--disable-features=VizDisplayCompositor",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
                "--memory-pressure-off",
                "--max_old_space_size=4096",
                "--headless=new",
            ],
        });

        console.log("Debug: Browser launched successfully");

        const context = await browser.newContext();
        console.log("Debug: Context created successfully");

        const page = await context.newPage();
        console.log("Debug: Page created successfully");

        await page.setContent("<html><body><h1>Test</h1></body></html>");
        console.log("Debug: Content set successfully");

        const title = await page.locator("h1").textContent();
        console.log("Debug: Title:", title);
        expect(title).toBe("Test");

        await page.close();
        await context.close();
        await browser.close();
        console.log("Debug: All resources closed successfully");
    });

    test("can use page fixture", async ({ page }) => {
        console.log("Debug: Testing page fixture");

        await page.setContent("<html><body><h1>Fixture Test</h1></body></html>");
        console.log("Debug: Content set via fixture");

        const title = await page.locator("h1").textContent();
        console.log("Debug: Fixture title:", title);
        expect(title).toBe("Fixture Test");
    });

    test("can navigate to application", async ({ page }) => {
        console.log("Debug: Testing application navigation");

        try {
            await page.goto("/");
            console.log("Debug: Successfully navigated to application");

            // ページが読み込まれるまで待機
            await page.waitForLoadState("domcontentloaded");
            console.log("Debug: DOM content loaded");

            // タイトルを確認
            const title = await page.title();
            console.log("Debug: Page title:", title);

            // ページが正常に読み込まれたことを確認
            expect(title).toBeTruthy();
        } catch (error) {
            console.log("Debug: Navigation error:", error);
            throw error;
        }
    });
});
