import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-41ab5daf
 *  Title   : Accessible outline tree semantics - initial focus
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Accessible outline tree initial focus", () => {
    test("Global editor does not steal focus on page load", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Item 1",
            "Item 2",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 3);

        // Wait a bit to ensure any stray RAF/setTimeout focus logic would have fired
        await page.waitForTimeout(500);

        // The hidden textarea should NOT have focus
        const textareaFocused = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() === 'textarea');
        expect(textareaFocused).toBe(false);

        // At this point, tab should put focus on the first item (with index 1)
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await expect(firstItem).toHaveAttribute("tabindex", "0");
    });
});
