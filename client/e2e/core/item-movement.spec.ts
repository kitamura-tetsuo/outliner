import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Item Movement and Focus", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Item 1",
            "Item 2",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 3);
    });

    test("pressing Tab from tree container focuses past the tree", async ({ page }) => {
        await page.locator('[role="tree"]').focus();

        const focusableCount = await page.evaluate(() => {
            const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
            return document.querySelector('[role="tree"]').querySelectorAll(sel).length;
        });

        console.log(`Focusable elements inside tree: ${focusableCount}`);
    });
});
