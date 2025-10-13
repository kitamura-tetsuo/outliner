import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature MCE-37b78b62
 *  Title   : Multi-Cursor Editing
 *  Source  : docs/client-features/mce-multi-cursor-editing-37b78b62.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("MCE-37b78b62: multi-cursor editing", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["a", "b"]);
    });

    test("two cursors can edit", async ({ page }) => {
        const firstId = await page.locator(".outliner-item").nth(0).getAttribute("data-item-id");
        const secondId = await page.locator(".outliner-item").nth(1).getAttribute("data-item-id");
        await TestHelpers.setCursor(page, firstId!, 0, "local");
        await TestHelpers.setCursor(page, secondId!, 0, "remote");
        await TestHelpers.insertText(page, firstId!, "x", "local");
        await TestHelpers.insertText(page, secondId!, "y", "remote");
        await TestHelpers.waitForCursorVisible(page);
        const count = await page.evaluate(() => Object.keys((window as any).editorOverlayStore.cursors).length);
        expect(count).toBe(2);
    });
});
