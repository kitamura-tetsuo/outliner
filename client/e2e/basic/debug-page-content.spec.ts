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

        await expect(page.locator("text=Firestore Store State")).toBeVisible({ timeout: 15000 });

        // 4. (Deprecated) Fluid connection tests removed as the new debug page is simplified.
        // We just verify that debugInfo is being populated in the <pre> tag.
        const debugPre = page.locator("pre");
        await expect(debugPre).not.toBeEmpty({ timeout: 10000 });

        const content = await debugPre.textContent();
        expect(content).toContain("User:");
        expect(content).toContain("Accessible Projects:");
    });
});
