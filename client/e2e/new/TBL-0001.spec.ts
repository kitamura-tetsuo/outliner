import { test, expect } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';

test.describe('TBL-0001', () => {
  test.beforeEach(async ({ page }) => {
    await TestHelpers.prepareTestEnvironment(page);
    await page.goto('/sql');
  });

  test('display query result', async ({ page }) => {
    await page.waitForSelector('textarea');
    await page.fill('textarea', 'SELECT 1 as value');
    await page.click('text=Run');
    await expect(page.locator('text=value')).toBeVisible();
    await expect(page.locator('text=1')).toBeVisible();
  });
});
