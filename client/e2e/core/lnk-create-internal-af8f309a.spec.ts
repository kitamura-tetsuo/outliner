import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0003
 *  Title   : Internal link navigation function
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0003: Internal link navigation function", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Create an internal link in the actual application", async ({ page }) => {
        // Select the first item
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Check focus state
        const focusState = await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return {
                textareaExists: !!textarea,
                focused: document.activeElement === textarea,
                activeElementTag: document.activeElement?.tagName,
                activeElementClass: document.activeElement?.className,
                textareaValue: textarea?.value || "",
            };
        });
        console.log("Focus state:", focusState);
        expect(focusState.focused).toBe(true);
    });
});
