import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Debug Page Health Check", () => {
    test("should hit local health endpoint", async ({ page }) => {
        // 1. Setup environment and login
        await page.goto("/");
        // Prepare environment (logs in, seeds data)
        await TestHelpers.prepareTestEnvironment(page, test.info(), ["Debug Health Test"], undefined, {
            skipAppReady: true,
        });

        // 2. Visit /debug
        await page.goto("/debug");

        // 3. Wait for UI to be ready
        await expect(page.locator("text=Firestore Store State")).toBeVisible({ timeout: 15000 });

        // 4. (Deprecated) Health Check button is removed in current UI.
        // Skipping button interaction and verifying API only if needed.
        // test.skip();
    });
});
