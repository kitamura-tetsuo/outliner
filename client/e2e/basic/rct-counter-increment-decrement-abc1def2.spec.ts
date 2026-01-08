import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature RCT-0001
 *  Title   : Counter increments and decrements
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("counter", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        await page.goto("/counter");
    });

    test("increments and decrements", async ({ page }) => {
        const inc = page.getByTestId("inc");
        const dec = page.getByTestId("dec");
        const value = page.getByTestId("value");

        await expect(value).toHaveText("0");
        await inc.click();
        await expect(value).toHaveText("1");
        await dec.click();
        await expect(value).toHaveText("0");
    });
});
