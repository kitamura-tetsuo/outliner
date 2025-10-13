import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-0001
 *  Title   : Enterで新規アイテム追加
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("ITM-0001: Enterで新規アイテム追加", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["First part of text. Second part of text."]);
        await TestHelpers.setupTreeDebugger(page);

        // Click on the first non-page-title item containing the test text
        const contentItem = page.locator(".outliner-item:not(.page-title)");
        await contentItem.first().locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
    });

    test("Yjs tree reflects split after Enter", async ({ page }) => {
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Home");
        for (let i = 0; i < "First part of text.".length; i++) {
            await page.keyboard.press("ArrowRight");
        }
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);
        await TreeValidator.waitForProjectReady(page);
        const treeData = await TreeValidator.getTreeData(page);
        expect(treeData.items[0].text).toBe("First part of text.");
        expect(treeData.items[1].text.trimStart()).toBe("Second part of text.");
    });
});
