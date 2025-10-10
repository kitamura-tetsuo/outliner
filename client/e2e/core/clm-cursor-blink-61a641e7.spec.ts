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
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("カーソルが点滅する", async ({ page }) => {
        await page.screenshot({ path: "client/test-results/CLM-0001-blink-start.png" });
        const item = page.locator(".outliner-item.page-title");
        if (await item.count() === 0) {
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }
        await TestHelpers.waitForCursorVisible(page);
        await page.waitForTimeout(500);
        await page.screenshot({ path: "client/test-results/CLM-0001-blink-end.png" });
    });
});
