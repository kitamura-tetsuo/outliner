/** @feature FTR-0013 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-0013: env vars on min page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("min page shows env variable", async ({ page }) => {
        await page.goto("/min");
        await expect(page).toHaveTitle(/Firebase/);
    });
});
