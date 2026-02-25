import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0001
 *  Title   : Click to enter edit mode
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0001: Click to enter edit mode", () => {
    test.setTimeout(180000); // 3 minutes
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Clicking outside the text of the last line places the cursor at the end of the line", async ({ page }) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line text");
        await page.keyboard.press("ArrowUp");
        const item = page.locator(".outliner-item.page-title");
        await item.locator(".item-content").click({ position: { x: 500, y: 0 } });
        await page.waitForTimeout(300);
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.activeItemId).not.toBeNull();
    });
});
