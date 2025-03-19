import { expect, test } from '@playwright/test';

test('Add Text button should add text to shared content', async ({ page }) => {
  // ホームページにアクセス
  await page.goto('/');
  
  // ページが読み込まれるまで一時停止（Fluidが初期化されるのを待つ）
  await page.waitForLoadState('networkidle');
  
  // テスト用のテキストを入力フィールドに入力
  const testText = 'Hello Fluid Framework!';
  await page.fill('input[placeholder="Enter text to share"]', testText);
  
  // Add Textボタンをクリック
  await page.click('button:has-text("Add Text")');
  
  // 共有コンテンツ領域にテキストが表示されるのを待つ
  // "Shared Text:" セクションの下のpreタグを対象に
  await expect(
    page.locator('.shared-content .mb-4 pre')
  ).toContainText(testText, { timeout: 5000 });
  
  // 入力フィールドがクリアされたことを確認
  await expect(page.locator('input[placeholder="Enter text to share"]')).toHaveValue('');

  // デバッグ用のスクリーンショットを保存 (オプション)
  await page.screenshot({ path: 'test-results/add-text-result.png' });
});

// SharedTreeデータが更新されることをテスト
test('Adding text updates SharedTree data', async ({ page }) => {
  // ホームページにアクセス
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // デバッグパネルを表示
  await page.click('button:has-text("Show Debug")');
  
  // テキスト追加前のTreeDataの状態を確認
  const initialDebugInfo = await page.textContent('.debug-panel details[open] pre');
  
  // テキストを追加
  await page.fill('input[placeholder="Enter text to share"]', 'Test data update');
  await page.click('button:has-text("Add Text")');
  
  // TreeDataが更新されるのを待つ（少し時間がかかる場合がある）
  await page.waitForTimeout(1000);
  
  // 更新後のDebugInfoを取得
  const updatedDebugInfo = await page.textContent('.debug-panel details[open] pre');
  
  // デバッグ情報が変更されたことを確認（厳密な比較ではなく変化を検出）
  expect(updatedDebugInfo).not.toEqual(initialDebugInfo);
});
