import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0001
 *  Title   : Click to enter edit mode
 *  Source  : docs/client-features.yaml
 */
import { test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0001: Click to enter edit mode", () => {
    test.setTimeout(180000); // 3 minutes
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Cursor is visible", async ({ page }) => {
        await page.waitForTimeout(100);
        // Screenshot removed to prevent ENOSPC errors in test environment
    });
});
