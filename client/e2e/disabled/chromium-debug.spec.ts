import "../utils/registerAfterEachSnapshot";
import { chromium, expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

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
            // Use the test helper to prepare the environment similar to other tests
            await page.goto("/");
            console.log("Debug: Successfully navigated to application");

            // Wait for the page to load
            await page.waitForLoadState("domcontentloaded");
            console.log("Debug: DOM content loaded");

            // Use the test helper to set up the necessary flags for the test environment
            await page.addInitScript(() => {
                try {
                    localStorage.setItem("VITE_IS_TEST", "true");
                    localStorage.setItem("VITE_IS_TEST_MODE_FORCE_E2E", "true");
                    localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                    localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
                    (window as any).__E2E__ = true;
                    (window as any).__vite_plugin_react_preamble_installed__ = true;
                } catch {}
            });

            // Wait for the application to initialize
            await page.waitForFunction(() => {
                return (window as any).generalStore || (window as any).appStore;
            }, { timeout: 10000 });

            // タイトルを確認 (expect any non-empty title rather than just truthy)
            const title = await page.title();
            console.log("Debug: Page title:", title);

            // The application should have a title once loaded
            expect(title).toBeTruthy();
        } catch (error) {
            console.log("Debug: Navigation error:", error);
            throw error;
        }
    });
});
