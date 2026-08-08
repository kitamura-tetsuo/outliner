import { expect, test } from "@playwright/test";
import { devices } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.use({ ...devices["Pixel 7"] });

test.describe("Mobile OS Selection Sync", () => {
    test("syncs OS selection changes to outliner store", async ({ page }) => {
        // Prepare page

        await TestHelpers.seedProjectAndNavigate(page, [
            { text: "Hello World" },
        ]);

        await page.waitForSelector("text=Loading Page...", { state: "hidden", timeout: 10000 });
        await page.waitForSelector(".item-text", { state: "visible" });

        // Find the page title and press Enter to create a new item
        const pageTitleItem = page.locator(".page-title .item-text");
        await pageTitleItem.click();

        // Svelte handles focus asynchronously, wait a bit
        await page.waitForTimeout(100);

        // Move to end of page title to press Enter
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");

        await page.waitForTimeout(500);
        await page.keyboard.type("Hello World");

        const textarea = page.locator(".global-textarea");
        await expect(textarea).toHaveValue("Hello World");

        // Simulate OS selecting all text via evaluate
        await textarea.evaluate((el: HTMLTextAreaElement) => {
            el.setSelectionRange(0, el.value.length);
            el.dispatchEvent(new Event("select"));
            // The browser selectionchange might not automatically fire from programmatically setting it here, so dispatch it manually just in case
            document.dispatchEvent(new Event("selectionchange"));
        });

        // Wait for Svelte state and RAF
        await page.waitForTimeout(100);

        // Typing should replace the selection
        await page.keyboard.press("A");
        await expect(textarea).toHaveValue("A");
    });
});
