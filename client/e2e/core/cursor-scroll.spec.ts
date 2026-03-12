import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Cursor scrolling behavior", () => {
    test("Cursor stays visible when moving down through a very tall item", async ({ page }, testInfo) => {
        // Authenticate and prepare environment
        const { projectName, pageName } = await TestHelpers.createAndSeedProject(page, testInfo, ["Initial"]);

        // Navigate to the seeded page
        await page.goto(`/${projectName}/${pageName}`);

        // Wait for connection to settle
        await page.waitForTimeout(1000);

        // Add a long text item that spans multiple heights of the viewport
        const longText = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}`).join("\n");

        await page.waitForSelector(".outliner-item");
        await page.locator(".outliner-item").first().click();

        await page.keyboard.press("Control+a"); // Select all to clear
        await page.keyboard.press("Backspace");

        // Insert text
        await page.keyboard.type(longText);

        // Move to the top
        await page.keyboard.press("Control+Home"); // Use shortcut instead of 150 ArrowUps

        // Wait for stability
        await page.waitForTimeout(500);

        // Get initial scroll position
        const initialScrollY = await page.evaluate(() => window.scrollY);

        // Move cursor down multiple times (should scroll the window down to follow the cursor)
        // We don't need 100 times to see scrolling. 40 times is enough to scroll down.
        // Also increase the wait to prevent playwright from overwhelming the process.
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(50);
        }

        // Wait a bit for smooth scroll to finish
        await page.waitForTimeout(1000);

        // Get final scroll position
        const finalScrollY = await page.evaluate(() => window.scrollY);

        // Expect the window to have scrolled down significantly
        expect(finalScrollY).toBeGreaterThan(initialScrollY);

        // Verify that the cursor element itself is visible in the viewport
        const isCursorVisible = await page.evaluate(() => {
            const cursorEl = document.querySelector(".cursor.active");
            if (!cursorEl) return false;
            const rect = cursorEl.getBoundingClientRect();
            // Assuming sticky header is 80px high
            const stickyHeaderHeight = 80;
            return rect.top >= stickyHeaderHeight && rect.bottom <= window.innerHeight;
        });

        expect(isCursorVisible).toBe(true);
    });
});
