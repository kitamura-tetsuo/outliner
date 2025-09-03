/** @feature CLM-0104
 *  Title   : Extended navigation commands
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

// Simplified E2E verifying word jump and bracket jump

test.describe("CLM-0104: Extended navigation commands", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [""]);
        const first = page.locator(".outliner-item").first();
        await first.locator(".item-content").click({ force: true });
        await page.keyboard.press("Enter");
        const item = page.locator(".outliner-item").nth(1);
        await item.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("Hello [test] world");
    });

    test("Ctrl+Left/Right move by word", async ({ page }) => {
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.down("Control");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.up("Control");
        const data = await CursorValidator.getCursorData(page);
        expect(data.cursorInstances[0].offset).toBe(6);
        await page.keyboard.down("Control");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Control");
        const data2 = await CursorValidator.getCursorData(page);
        expect(data2.cursorInstances[0].offset).toBe(12);
    });

    test("Ctrl+Shift+\\ jumps between brackets", async ({ page }) => {
        await page.keyboard.press("Home");
        await page.keyboard.down("Control");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Control");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.down("Control");
        await page.keyboard.down("Shift");
        await page.keyboard.press("\\");
        await page.keyboard.up("Shift");
        await page.keyboard.up("Control");
        const data = await CursorValidator.getCursorData(page);
        expect(data.cursorInstances[0].offset).toBe(12);
    });
});
import "../utils/registerAfterEachSnapshot";
