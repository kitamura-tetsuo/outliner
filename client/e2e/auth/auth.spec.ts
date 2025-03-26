import { expect, test } from '@playwright/test';

/**
 * @playwright
 * @title 認証機能テスト
 */

test.describe('認証UI機能テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Googleログインボタンが表示される', async ({ page }) => {
    // ログインボタンが表示されることを確認
    await expect(page.locator('.google-btn')).toBeVisible();

    // テキストも確認
    await expect(page.getByText('Googleでログイン')).toBeVisible();
  });
});
