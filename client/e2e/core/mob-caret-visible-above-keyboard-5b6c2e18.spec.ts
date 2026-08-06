import { expect, test } from "@playwright/test";
import { devices } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.use({ ...devices["Pixel 7"] });

test.describe("Mobile keyboard caret visibility", () => {
    test("Caret scrolls above keyboard and toolbar when tapping lower screen", async ({ page }, testInfo) => {
        const lines = Array.from({ length: 40 }, (_, i) => `Item ${i + 1}`);

        await page.addInitScript(() => {
            const originalHeight = window.innerHeight;
            const simulatedKeyboardHeight = 350;
            const vv = {
                height: originalHeight,
                width: window.innerWidth,
                offsetLeft: 0,
                offsetTop: 0,
                pageLeft: 0,
                pageTop: 0,
                scale: 1,
                listeners: {},
                addEventListener: function(t, cb) {
                    if (!this.listeners[t]) this.listeners[t] = [];
                    this.listeners[t].push(cb);
                },
                removeEventListener: function(t, cb) {
                    if (!this.listeners[t]) return;
                    this.listeners[t] = this.listeners[t].filter(l => l !== cb);
                },
                dispatchEvent: function(t) {
                    if (!this.listeners[t]) return;
                    this.listeners[t].forEach(cb => cb(new Event(t)));
                },
            };

            Object.defineProperty(window, "visualViewport", {
                value: vv,
                writable: true,
                configurable: true,
            });

            window.__simulateKeyboard = () => {
                window.visualViewport.height = originalHeight - simulatedKeyboardHeight;
                window.visualViewport.dispatchEvent("resize");
                window.visualViewport.dispatchEvent("scroll");
            };
        });

        await TestHelpers.seedProjectAndNavigate(page, testInfo, lines);

        await TestHelpers.waitForOutlinerItems(page, 40);

        // Tap the 30th item
        const itemId = await TestHelpers.getItemIdByIndex(page, 30);
        const itemLocator = page.locator(`.outliner-item[data-item-id="${itemId}"] .item-content`);
        await itemLocator.click();

        await page.waitForTimeout(500);

        // Simulate keyboard opening
        await page.evaluate(() => {
            window.__simulateKeyboard();
        });

        // Wait for scroll
        await page.waitForTimeout(500);

        // Verify caret position is visible
        const isVisible = await page.evaluate(() => {
            const cursor = document.querySelector(".cursor.active");
            if (!cursor) return false;
            const rect = cursor.getBoundingClientRect();
            const vv = window.visualViewport;
            return rect.bottom <= vv.height && rect.top >= 0;
        });

        expect(isVisible).toBe(true);
    });
});
