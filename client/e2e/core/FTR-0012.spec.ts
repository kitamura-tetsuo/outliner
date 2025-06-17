/** @feature FTR-0012 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-0012: reset forgotten password", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("forgot password page loads", async ({ page }) => {
        await page.goto("/auth/forgot");
        await expect(page.locator("h1")).toHaveText(/Forgot/i);
    });
});
