/** @feature SCH-6974F589
 *  Title   : Schedule Management Page
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SCH-6974F589: Schedule Management Page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("page loads", async ({ page }) => {
        await page.goto("http://localhost:7090/schedule");
        await expect(page).toHaveTitle(/Outliner/);
    });
});
import "../utils/registerAfterEachSnapshot";
