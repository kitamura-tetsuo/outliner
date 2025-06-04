// minimal.spec.ts
import { expect, test } from '@playwright/test';

test('最小限の検証テスト', async ({ page }) => {
  await page.goto('https://www.google.com'); // 確実にアクセスできる外部サイト
  await expect(page).toHaveTitle(/Google/);
});