import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

import { expect, test } from "@playwright/test";

/**
 * @testcase Tailwind classes are applied correctly
 * @description Verify that Tailwind classes are working. Note: currently expected to fail for demonstration/debugging purposes.
 */
test("Tailwind classes are applied correctly", async ({ page }) => {
    // Navigating to a page where Tailwind classes are actually used
    await page.goto("/settings");

    // Testing the h1 element with classes: "text-3xl font-bold mb-8"
    // Note: If Tailwind is not working as expected, this might fail, which is intended per user request.
    const element = page.locator("h1", { hasText: "Settings" });

    // Check font-size (text-3xl should be 1.875rem = 30px, assuming 16px base)
    // Check font-weight (font-bold should be 700)
    await expect(element).toHaveCSS("font-size", "30px");
    await expect(element).toHaveCSS("font-weight", "700");
});
