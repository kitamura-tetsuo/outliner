import { expect, test } from '@playwright/test';

test('ホームページが正常に表示される', async ({ page }) => {
  // FluidClientをモック化するスクリプトを挿入
  await page.addInitScript(() => {
    window.mockFluidClient = true;
  });

  await page.goto('/');

  // タイトルが表示されることを確認
  await expect(page.locator('h1')).toContainText('Fluid Outliner App');

  // 認証コンポーネントが表示されることを確認
  await expect(page.locator('.auth-section')).toBeVisible();
});

test('認証UIが正しく表示される', async ({ page }) => {
  // FluidClientをモック化するスクリプトを挿入
  await page.addInitScript(() => {
    window.mockFluidClient = true;
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // CSSセレクタを使用してボタン要素をより正確に特定
  const loginButton = page.locator('.auth-container button.google-btn');
  await expect(loginButton).toBeVisible();
});
