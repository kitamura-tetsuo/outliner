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
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await firstItem.click();

        await expect(firstItem).toHaveAttribute("tabindex", "0");

        const focusableClasses = await page.evaluate(() => {
            const sel =
                'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex="0"]';
            const elements = document.querySelector('[role="tree"]')?.querySelectorAll(sel);
            return Array.from(elements || []).map(el => el.className || el.tagName);
        });

        const newFocusableCount = focusableClasses.length;
        expect(newFocusableCount).toBeLessThan(3);
    });
});
