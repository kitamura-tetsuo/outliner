import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Debug Page", () => {
    test("should display YjsClient debug info", async ({ page }) => {
        // 1. Setup environment and login
        await page.goto("/");
        // Prepare environment (logs in, seeds data)
        await TestHelpers.prepareTestEnvironment(page, test.info(), ["Debug Test Page"], undefined, {
            skipAppReady: true,
        });

        // 2. Visit /debug
        await page.goto("/debug");

        // 3. Verify authenticated content is shown
        // Wait for auth to propagate and UI to update
        await expect(page.locator("text=Connection Status")).toBeVisible({ timeout: 15000 });

        // 4. Click Connect Test button if needed
        // The page auto-connects, but clicking button triggers updateConnectionStatus() which calls getDebugInfo()
        await page.click("text=Run Connection Test");

        // 5. Check Debug Info
        const details = page.locator("details:has-text('Yjs Client')");
        await expect(details).toBeVisible();

        // Force open if closed (though it has 'open' attribute in code)
        const isOpen = await details.evaluate((el: HTMLDetailsElement) => el.open);
        if (!isOpen) {
            await details.locator("summary").click();
        }

        const debugInfoPre = details.locator("pre");

        // Get content
        const content = await debugInfoPre.textContent();
        expect(content).toBeTruthy();

        const info = JSON.parse(content || "{}");

        // Verify fields from getDebugInfo()
        expect(info.clientId).toBeTruthy();
        expect(info.containerId).toBeTruthy();
        expect(info.connectionState).toBeTruthy();
        expect(info.isSynced).toBeDefined();

        // Check provider info
        if (info.provider) {
            expect(info.provider.url).toBeTruthy();
        }
    });
});
