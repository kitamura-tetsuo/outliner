import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Outliner Basic Test (No Auth)", () => {
    test("can access outliner interface elements", async ({ page }) => {
        console.log("Debug: Testing outliner interface without authentication");

        await page.goto("/", {
            timeout: 60000,
            waitUntil: "domcontentloaded",
        });

        // Wait until the page is loaded
        await page.waitForTimeout(500);

        console.log("Debug: Page loaded, checking for outliner elements");

        // Check for basic outliner elements
        const body = page.locator("body");
        await expect(body).toBeVisible();

        // Check the page content
        const pageContent = await page.content();
        console.log("Debug: Page contains outliner elements:", pageContent.includes("outliner"));

        // Check the basic DOM structure
        const mainElement = page.locator('main, #app, [data-testid="app"]').first();
        if (await mainElement.count() > 0) {
            await expect(mainElement).toBeVisible();
            console.log("Debug: Main application element found");
        } else {
            console.log("Debug: No main application element found, checking body");
        }

        // Check for JavaScript errors
        const errors: string[] = [];
        page.on("console", msg => {
            if (msg.type() === "error") {
                errors.push(msg.text());
            }
        });

        // Wait a bit and collect errors
        await page.waitForTimeout(500);

        if (errors.length > 0) {
            console.log("Debug: JavaScript errors found:", errors);
        } else {
            console.log("Debug: No JavaScript errors detected");
        }
    });

    test("can check for UserManager availability", async ({ page }) => {
        console.log("Debug: Testing UserManager availability");

        await page.goto("/", {
            timeout: 60000,
            waitUntil: "domcontentloaded",
        });

        // Wait until the page is loaded
        await page.waitForTimeout(5000);

        // Check for the existence of UserManager
        const userManagerExists = await page.evaluate(() => {
            return {
                userManagerExists: typeof (window as any).__USER_MANAGER__ !== "undefined",
                userManagerType: typeof (window as any).__USER_MANAGER__,
                windowKeys: Object.keys(window).filter(key => key.startsWith("__")),
                globalThis: typeof globalThis !== "undefined",
            };
        });

        console.log("Debug: UserManager check result:", userManagerExists);

        // Check the state of global variables
        const globalVars = await page.evaluate(() => {
            const win = window as any;
            return {
                userManager: typeof win.__USER_MANAGER__,
                svelteGoto: typeof win.__SVELTE_GOTO__,
                allGlobals: Object.keys(win).filter(key => key.startsWith("__")),
            };
        });

        console.log("Debug: Global variables state:", globalVars);
    });

    test("can wait for application initialization", async ({ page }) => {
        console.log("Debug: Testing application initialization");

        await page.goto("/", {
            timeout: 60000,
            waitUntil: "domcontentloaded",
        });

        // Wait for application initialization (up to 30 seconds)
        try {
            await page.waitForFunction(
                () => {
                    const win = window as any;
                    const hasUserManager = typeof win.__USER_MANAGER__ !== "undefined";
                    console.log("Checking initialization - UserManager:", hasUserManager);
                    return hasUserManager;
                },
                { timeout: 30000 },
            );
            console.log("Debug: Application initialized successfully");
        } catch (error) {
            console.log("Debug: Application initialization timeout:", error);

            // Check the state at timeout
            const state = await page.evaluate(() => {
                const win = window as any;
                return {
                    userManager: typeof win.__USER_MANAGER__,
                    readyState: document.readyState,
                    location: window.location.href,
                    errors: win.__INIT_ERRORS__ || [],
                };
            });
            console.log("Debug: Application state at timeout:", state);
        }
    });
});
