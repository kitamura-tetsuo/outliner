import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

import { TestHelpers } from "../utils/testHelpers";

test.describe("Cursor scrolling behavior", () => {
    test("Cursor stays visible when moving down through a very tall item", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        // Authenticate and prepare environment
        const { projectName, pageName } = await TestHelpers.createAndSeedProject(page, testInfo, ["Initial"]);

        // Navigate to the seeded page
        await page.goto(`/${projectName}/${pageName}`);

        // Wait for connection to settle
        await page.waitForTimeout(1000);

        // Add a long text item that spans multiple heights of the viewport
        const longText = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join("\n");

        await page.waitForSelector(".outliner-item");
        await page.locator(".outliner-item").first().click();

        await page.keyboard.press("Control+a"); // Select all to clear
        await page.keyboard.press("Backspace");

        // Insert text
        await page.keyboard.insertText(longText);

        // Click at the start to move to the top
        await page.locator(".outliner-item").first().click({ position: { x: 5, y: 5 } });

        // Wait for stability
        await page.waitForTimeout(500);

        // Get initial scroll position from the scrollable container
        // The container is usually `.tree-container` or `window`
        const getScrollY = async () => {
            return await page.evaluate(() => {
                const container = document.querySelector(".tree-container");
                return container ? container.scrollTop : window.scrollY;
            });
        };

        const initialScrollY = await getScrollY();

        // Move cursor down 60 times (should scroll the window down to follow the cursor)
        for (let i = 0; i < 60; i++) {
            await page.keyboard.press("ArrowDown");
            // Give it a tiny bit of time for each to ensure we don't batch it all together
            await page.waitForTimeout(10);
        }

        // Wait a bit for smooth scroll to finish
        await page.waitForTimeout(1000);

        // Get final scroll position
        const finalScrollY = await getScrollY();

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
