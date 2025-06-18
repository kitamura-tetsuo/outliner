/** @feature FTR-0015 */
import { test, expect } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';

test.describe('FTR-0015 - Authentication Login Flow', () => {
    test('User can login and logout', async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
        await page.waitForSelector('.auth-container');

        const devToggle = page.locator('button.dev-toggle');
        await devToggle.click();
        await page.waitForSelector('.dev-login-form');

        await page.locator('#email').fill('test@example.com');
        await page.locator('#password').fill('password');
        await page.locator('button.dev-login-btn').click();

        await expect(page.locator('button.logout-btn')).toBeVisible({ timeout: 10000 });

        await page.locator('button.logout-btn').click();
        await expect(page.locator('button.dev-toggle')).toBeVisible({ timeout: 10000 });
    });

    test('Login session persists after reload', async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
        await page.waitForSelector('.auth-container');

        const devToggle = page.locator('button.dev-toggle');
        await devToggle.click();
        await page.waitForSelector('.dev-login-form');

        await page.locator('#email').fill('test@example.com');
        await page.locator('#password').fill('password');
        await page.locator('button.dev-login-btn').click();

        await expect(page.locator('button.logout-btn')).toBeVisible({ timeout: 10000 });

        await page.reload();
        await page.waitForSelector('.auth-container');
        await expect(page.locator('button.logout-btn')).toBeVisible({ timeout: 10000 });

        await page.locator('button.logout-btn').click();
    });
});
