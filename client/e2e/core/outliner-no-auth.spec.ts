/* eslint-disable no-restricted-globals */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpersNoAuth } from "../utils/testHelpersNoAuth.js";
registerCoverageHooks();

test.describe("Outliner No Auth Test", () => {
    test("can load and interact with outliner without authentication", async ({ page }, testInfo) => {
        console.log("Debug: Testing outliner without authentication");

        // Set up error monitoring
        const errors = TestHelpersNoAuth.setupErrorMonitoring(page);

        // Set up network monitoring
        const network = TestHelpersNoAuth.setupNetworkMonitoring(page);

        // Prepare environment (no authentication)
        const envResult = await TestHelpersNoAuth.prepareTestEnvironmentNoAuth(page, testInfo);
        console.log("Debug: Environment preparation result:", envResult);

        expect(envResult.success).toBe(true);

        // Verify basic elements
        const elementsValid = await TestHelpersNoAuth.verifyBasicElements(page);
        expect(elementsValid).toBe(true);

        // Verify outliner elements
        const outlinerElements = await TestHelpersNoAuth.findOutlinerElements(page);
        console.log("Debug: Outliner elements found:", outlinerElements);

        // Test basic keyboard operations
        await page.keyboard.press("Escape");
        console.log("Debug: Pressed Escape key");

        // Wait a moment and collect errors
        await page.waitForTimeout(300);

        // Error report
        if (errors.length > 0) {
            console.log("Debug: JavaScript errors detected:", errors);
        } else {
            console.log("Debug: No JavaScript errors detected");
        }

        // Network report
        console.log("Debug: Network requests:", network.requests.length);
        console.log("Debug: Network responses:", network.responses.length);

        // Check failed requests
        const failedRequests = network.responses.filter(r => r.status >= 400);
        if (failedRequests.length > 0) {
            console.log("Debug: Failed requests:", failedRequests);
        }
    });

    test("can check application state without authentication", async ({ page }, testInfo) => {
        console.log("Debug: Testing application state without authentication");

        // Prepare environment
        const envResult = await TestHelpersNoAuth.prepareTestEnvironmentNoAuth(page, testInfo);
        expect(envResult.success).toBe(true);

        // Check application state
        const appState = await page.evaluate(() => {
            const win = window as any;
            return {
                // Check global variables
                userManager: typeof win.__USER_MANAGER__,
                svelteGoto: typeof win.__SVELTE_GOTO__,
                firebaseApp: typeof win.__firebase_client_app__,

                // Check DOM state
                readyState: document.readyState,
                location: window.location.href,

                // Check basic DOM elements
                bodyExists: !!document.body,
                headExists: !!document.head,

                // Svelte app state
                svelteKit: typeof win.__SVELTEKIT_DEV__,

                // Available global variables
                allGlobals: Object.keys(win).filter(key => key.startsWith("__")),
            };
        });

        console.log("Debug: Application state:", appState);

        // Check basic state
        expect(appState.readyState).toBe("complete");
        expect(appState.bodyExists).toBe(true);
        expect(appState.headExists).toBe(true);
        expect(appState.location).toMatch(/(localhost|127\.0\.0\.1):7090/);

        // Verify that UserManager exists (initialized even without authentication)
        if (appState.userManager === "object") {
            console.log("Debug: UserManager is available");
        } else {
            console.log("Debug: UserManager is not available");
        }
    });

    test("can perform basic DOM interactions without authentication", async ({ page }, testInfo) => {
        console.log("Debug: Testing basic DOM interactions without authentication");

        // Prepare environment
        const envResult = await TestHelpersNoAuth.prepareTestEnvironmentNoAuth(page, testInfo);
        expect(envResult.success).toBe(true);

        // Basic click operation
        const body = page.locator("body");
        await body.click();
        console.log("Debug: Clicked on body");

        // Keyboard operation
        await page.keyboard.press("Tab");
        console.log("Debug: Pressed Tab key");

        await page.keyboard.press("Enter");
        console.log("Debug: Pressed Enter key");

        await page.keyboard.press("ArrowDown");
        console.log("Debug: Pressed ArrowDown key");

        await page.keyboard.press("ArrowUp");
        console.log("Debug: Pressed ArrowUp key");

        // Test text input
        await page.keyboard.type("test input");
        console.log("Debug: Typed test input");

        // Wait a moment
        await page.waitForTimeout(300);

        // Verify that page state is stable
        const finalUrl = page.url();
        console.log("Debug: Final URL:", finalUrl);
        expect(finalUrl).toMatch(/(localhost|127\.0\.0\.1):7090/);
    });
});
