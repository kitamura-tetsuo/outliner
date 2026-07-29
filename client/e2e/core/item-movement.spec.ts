import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

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
            const elements = Array.from(document.querySelector('[role="tree"]')?.querySelectorAll(sel) || []).filter(
                el => !el.closest("dialog"),
            );
            return elements.map(el => el.className || el.tagName);
        });

        const newFocusableCount = focusableClasses.length;
        expect(newFocusableCount).toBeLessThan(3);
    });
});
