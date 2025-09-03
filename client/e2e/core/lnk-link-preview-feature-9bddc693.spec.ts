/** @feature LNK-9bddc693
 *  Title   : Link preview feature
 *  Source  : docs/client-features/lnk-link-preview-feature-9bddc693.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-9bddc693: link preview", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["[[Page]]"]);
    });

    test("page loads", async ({ page }) => {
        await expect(page).toHaveURL(/Test\%20Project/);
    });
});
import "../utils/registerAfterEachSnapshot";
