/** @feature FTR-0012
 *  Title   : User can reset forgotten password
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-0012: Forgot password flow", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
    });

    test("User sees reset link notification after submitting email", async ({ page }) => {
        await page.goto("/auth/forgot");

        await page.fill("input[type=email]", "test@example.com");
        await page.click("button[type=submit]");

        await expect(page.locator(".reset-link-sent"))
            .toBeVisible({ timeout: 10000 });
    });

    test("User can enter new password with token", async ({ page }) => {
        await page.goto("/auth/reset-password?oobCode=dummyCode");

        await expect(page.locator('input[name="newPassword"]')).toBeVisible();
        await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();

        await page.fill('input[name="newPassword"]', 'Password123!');
        await page.fill('input[name="confirmPassword"]', 'Password123!');
        await page.click('button[type=submit]');

        await expect(page.locator('.reset-success')).toBeVisible();
    });
});
