import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();
// E2E: Login status indicator menu → Sign out
// Keep this spec small and deterministic per project guidance.

test("opens user menu and signs out from toolbar indicator", async ({ page }, testInfo) => {
    // Prepare minimal environment and navigate to home (toolbar is global)
    await TestHelpers.prepareTestEnvironmentForProject(page, testInfo);

    const indicator = page.getByTestId("login-status-indicator");
    await expect(indicator).toBeVisible();

    // Ensure authenticated; fallback to dev-login UI when needed
    let status = (await indicator.getAttribute("data-status")) || "";
    if (status !== "authenticated") {
        // Try built-in dev-login UI in AuthComponent
        const devToggle = page.locator("button.dev-toggle");
        if (await devToggle.isVisible()) {
            await devToggle.click();
            await page.waitForSelector(".dev-login-form", { timeout: 10000 });
            await page.locator("#email").fill("test@example.com");
            await page.locator("#password").fill("password");
            await page.locator("button.dev-login-btn").click();
        } else {
            // Fallback: call UserManager directly if UI is not present
            await page.evaluate(async () => {
                const mgr = (window as any).__USER_MANAGER__;
                if (mgr?.loginWithEmailPassword) {
                    await mgr.loginWithEmailPassword("test@example.com", "password");
                }
            });
        }
        // Wait for toolbar indicator to reflect authenticated state
        await expect(indicator).toHaveAttribute("data-status", "authenticated", { timeout: 20000 });
    }

    // 1) Click the indicator to open the dropdown menu
    await indicator.click();
    const menu = page.getByTestId("user-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Sign out");

    // 2) Click Sign out → should log out and close menu
    const signOut = page.getByTestId("user-menu-signout");
    await expect(signOut).toBeVisible();
    await signOut.click();

    await expect(indicator).toHaveAttribute("data-status", "unauthenticated", { timeout: 20000 });
    await expect(menu).toBeHidden({ timeout: 10000 });

    // Optional: dev-login toggle visible again
    await expect(page.locator("button.dev-toggle")).toBeVisible();
});
