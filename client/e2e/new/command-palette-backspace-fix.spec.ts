import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Command Palette Backspace Fix", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("pressing backspace immediately after opening palette at offset 0 should not duplicate text", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // Find the first outliner item
        const firstItem = page.locator(".outliner-item").first();
        await expect(firstItem).toBeVisible();

        // Focus the item
        await firstItem.click({ position: { x: 5, y: 5 } });
        await page.waitForSelector(".cursor", { state: "visible" });

        // Add some initial text
        await page.keyboard.type("hello world");

        await expect(page.locator(".item-content").first()).toHaveText(/hello world/);

        // Move cursor back to beginning (offset 0)
        for (let i = 0; i < "hello world".length; i++) {
            await page.keyboard.press("ArrowLeft");
        }

        // Type / to open command palette
        await page.keyboard.type("/");

        // Wait for palette to appear
        const palette = page.locator(".slash-command-palette");
        await expect(palette).toBeVisible();

        // Press Backspace
        await page.keyboard.press("Backspace");

        // Verify palette closes and text is NOT duplicated
        await expect(palette).toBeHidden();

        // Wait and verify text hasn't been duplicated
        await page.waitForTimeout(500); // Allow time for CRDT/UI update if any was to occur

        // Assert that the text is correctly "hello world" and not duplicated
        const textContent = await page.locator(".item-content").first().textContent();
        expect(textContent?.trim()).toContain("hello world");
        expect(textContent?.trim().includes("hello worldhello world")).toBe(false);
        expect(textContent?.trim().includes("/hello world")).toBe(false);
    });
});
