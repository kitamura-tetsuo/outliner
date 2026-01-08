import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

test.describe("Simple Server Startup", () => {
    test.beforeEach(async ({ page }) => {
        // Set necessary environment flags to avoid unwanted redirects or behaviors
        await page.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_E2E_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
        });
    });

    test("Server returns 200 OK", async ({ page }) => {
        const response = await page.goto("/", { timeout: 30000 });
        expect(response?.status()).toBe(200);
        console.log("Server status check: 200 OK.");
    });

    test("Served application shell is visible", async ({ page }) => {
        // Navigate to root
        await page.goto("/", { timeout: 30000 });

        // Check for the sveltekit shell which indicates the app structure is serving
        const shell = page.locator('[data-testid="sveltekit-shell"]');
        await expect(shell).toBeAttached({ timeout: 10000 });

        // Note: The placeholder might be removed quickly by hydration, so checking the shell is usually enough.
        // But checking the shell presence is a good "server is up" indicator.

        console.log("Server startup check: Shell found.");
    });
});
