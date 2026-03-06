import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

test.describe("Tailwind CSS validation", () => {
    test("Tailwind CSS classes should be applied", async ({ page }) => {
        // Navigate to the settings page where we can observe the impact of Tailwind
        await page.goto("/settings");

        // The H1 in settings should have text-3xl (SEA-0001)
        const h1 = page.locator("h1");
        await expect(h1).toBeVisible();

        // Check if font-size is approx 30px (1.875rem)
        const fontSize = await h1.evaluate((el) => window.getComputedStyle(el).fontSize);
        console.log(`H1 Font Size: ${fontSize}`);

        // In Tailwind v4, text-3xl is 30px
        // We check for a range to be safe against rounding or theme variations
        const sizeValue = parseFloat(fontSize);
        expect(sizeValue).toBeGreaterThan(25);
        expect(sizeValue).toBeLessThan(35);

        // Check font-weight (font-bold should be 700)
        const fontWeight = await h1.evaluate((el) => window.getComputedStyle(el).fontWeight);
        console.log(`H1 Font Weight: ${fontWeight}`);
        expect(parseInt(fontWeight)).toBeGreaterThanOrEqual(600);
    });

    test("Dynamic utility classes from +layout.svelte should be generated", async ({ page }) => {
        await page.goto("/");

        // The skip link should have text-[41px], text-[42px] and text-3xl
        const skipLink = page.locator(".skip-link");
        await expect(skipLink).toBeAttached();

        const fontSize = await skipLink.evaluate((el) => window.getComputedStyle(el).fontSize);
        console.log(`Skip Link Font Size: ${fontSize}`);

        // Since we have multiple classes, the last one (text-3xl) might win if they conflict,
        // but text-[42px] is also there.
        // We just want to see if it's NOT the default small size.
        const sizeValue = parseFloat(fontSize);
        expect(sizeValue).toBeGreaterThan(20);
    });
});
