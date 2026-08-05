import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Clipboard Formatting", () => {
    test("copies multi-item formatting", async ({ page }, testInfo) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "plain start",
            "has [[bold]] and [/ italic] here",
            "plain end"
        ]);

        // Wait for page name item to appear first, seeded items are after it
        const items = page.locator(".item-text");
        await expect(items).toHaveCount(4); // title + 3 items

        // Select the 3 seeded items
        const firstItem = items.nth(1); // skip title
        await firstItem.click({ clickCount: 3 });
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
        await page.keyboard.press("Shift+ArrowDown");
        await page.keyboard.press("Shift+ArrowDown");
        await page.keyboard.press("Shift+End");

        // Set up clipboard capture
        await page.evaluate(() => {
            (window as any).clipboardData = "";
            document.addEventListener("copy", (e: any) => {
                (window as any).clipboardData = e.clipboardData?.getData("text/plain") || "";
            });
        });

        // Copy
        await page.keyboard.press("Control+c");
        await page.waitForTimeout(300);

        // Verify clipboard contents
        const clipboardText = await page.evaluate(() => (window as any).clipboardData);
        expect(clipboardText).toContain("plain start");
        expect(clipboardText).toContain("has [[bold]] and [/ italic] here");
        expect(clipboardText).toContain("plain end");
    });
});
