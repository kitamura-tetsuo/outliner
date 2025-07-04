/** @feature THM-0002
 *  Title   : Dark mode preference persists
 *  Source  : docs/client-features/thm-dark-mode-persistence-0f7c39db.yaml
 */
import { expect, test } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';

test.describe('THM-0002: Dark mode preference persists', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
  });

  test('dark mode state restored after reload', async ({ page }) => {
    // initial state should be light mode
    await expect(page.evaluate(() => document.documentElement.classList.contains('dark'))).resolves.toBe(false);

    // enable dark mode
    await page.getByRole('button', { name: 'Dark Mode' }).click();
    await expect(page.evaluate(() => document.documentElement.classList.contains('dark'))).resolves.toBe(true);

    // reload and verify state persists
    await page.reload();
    await expect(page.evaluate(() => document.documentElement.classList.contains('dark'))).resolves.toBe(true);
  });
});
