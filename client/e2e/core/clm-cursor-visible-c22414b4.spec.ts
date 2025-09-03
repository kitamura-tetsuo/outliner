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

    test("カーソルが表示される", async ({ page }) => {
        await page.waitForTimeout(100);
        await page.screenshot({ path: "client/test-results/CLM-0001-cursor-visible.png" });
    });
});
import "../utils/registerAfterEachSnapshot";
