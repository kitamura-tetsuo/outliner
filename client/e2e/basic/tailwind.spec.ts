import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

import { expect, test } from "@playwright/test";

/**
 * @testcase Tailwind classes are applied correctly
 * @description Verify that Tailwind v4 classes are working.
 * Note: Tailwind v4 with @tailwindcss/vite generates utility CSS lazily via module
 * graph scanning. The first page visit triggers class scanning via HMR, so we
 * navigate twice: first to trigger CSS generation, then to assert the applied styles.
 */
test("Tailwind classes are applied correctly", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Testing the h1 element with classes: "text-3xl font-bold mb-8"
    const element = page.locator("h1", { hasText: "Settings" });
    await expect(element).toBeVisible();

    // Wait for Tailwind's CSS to be applied (font-size should change from default 16px to ~30px)
    // text-3xl = 1.875rem = 30px (assuming 16px base)
    await page.waitForFunction(() => {
        const h1 = document.querySelector("h1");
        if (!h1) return false;
        const size = parseFloat(window.getComputedStyle(h1).fontSize);
        return size > 25 && size < 35;
    }, { timeout: 30000 });

    // Check font-size (text-3xl should be 1.875rem = 30px, assuming 16px base)
    const fontSize = await element.evaluate((el) => window.getComputedStyle(el).fontSize);
    const sizeValue = parseFloat(fontSize);
    expect(sizeValue).toBeGreaterThan(25);
    expect(sizeValue).toBeLessThan(35);

    // Check font-weight (font-bold should be 700)
    const fontWeight = await element.evaluate((el) => window.getComputedStyle(el).fontWeight);
    expect(parseInt(fontWeight)).toBeGreaterThanOrEqual(600);
});
