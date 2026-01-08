import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0105
 *  Title   : Dictionary-based key handler
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0105: Dictionary-based key handler", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["first", "second"]);
        const first = page.locator(`.outliner-item[data-item-id]`).filter({ hasText: "first" });
        await first.waitFor();
        await first.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await TestHelpers.waitForCursorVisible(page);
    });

    test("Ctrl+Shift+Alt+ArrowDown adds a cursor", async ({ page }) => {
        const before = await CursorValidator.getCursorData(page);
        await page.keyboard.down("Control");
        await page.keyboard.down("Shift");
        await page.keyboard.down("Alt");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Alt");
        await page.keyboard.up("Shift");
        await page.keyboard.up("Control");
        const after = await CursorValidator.getCursorData(page);
        expect(after.cursorInstances.length).toBe(before.cursorInstances.length + 1);
    });

    test("Ctrl+Shift+Z removes last cursor", async ({ page }) => {
        await page.keyboard.down("Control");
        await page.keyboard.down("Shift");
        await page.keyboard.down("Alt");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Alt");
        await page.keyboard.up("Shift");
        await page.keyboard.up("Control");
        const before = await CursorValidator.getCursorData(page);
        await page.keyboard.down("Control");
        await page.keyboard.down("Shift");
        await page.keyboard.press("z");
        await page.keyboard.up("Shift");
        await page.keyboard.up("Control");
        const after = await CursorValidator.getCursorData(page);
        expect(after.cursorInstances.length).toBe(before.cursorInstances.length - 1);
    });
});
