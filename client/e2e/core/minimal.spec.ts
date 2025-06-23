/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
// minimal.spec.ts
import { expect, test } from '@playwright/test';

test('最小限の検証テスト', async ({ page }) => {
  await page.goto('https://www.google.com'); // 確実にアクセスできる外部サイト
  await expect(page).toHaveTitle(/Google/);
});