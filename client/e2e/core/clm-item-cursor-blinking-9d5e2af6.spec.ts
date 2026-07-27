import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-9d5e2af6
 *  Title   : Item cursor blinking
 *  Source  : docs/client-features/clm-item-cursor-blinking-9d5e2af6.yaml
 */
import { test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-9d5e2af6: Item cursor blinking", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Blinking caret line"]);
    });

    test("Blink phase restarts on after typing", async ({ page }) => {
        const item = page.locator(".outliner-item[data-item-id]").filter({ hasText: "Blinking caret line" });
        await item.first().locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Wait past the "on" half of the period so the caret is in its off phase,
        // then type: the phase must restart on.
        await page.waitForTimeout(700);
        await page.keyboard.type("X");

        await CursorValidator.assertCursorBlinkPhaseOn(page);
    });
});
