import { expect, test } from '@playwright/test';

/**
 * @playwright
 * @title 認証機能テスト
 */

test.describe('認証UI機能テスト', () => {
  test.beforeEach(async ({ page }) => {
    // テスト開始前に十分な時間を設定
    test.setTimeout(60000);

    // ホームページにアクセス
    await page.goto('/');

    // ページが完全に読み込まれるまで待機
    await page.waitForLoadState('networkidle');
    console.log('Page loaded, waiting for UI elements to stabilize...');

    // UIが安定するまでさらに待機
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  test('Googleログインボタンが表示される', async ({ page }) => {
    // より具体的なセレクタを使用して、Googleログインボタンのみに一致するようにする
    const loginButton = page.locator('.google-btn');

    // ボタンが表示されるまで待機（最大30秒）
    await expect(loginButton).toBeVisible({ timeout: 30000 });
    console.log('Login button is visible');

    // ボタンのテキストをログ出力
    const buttonText = await loginButton.textContent();
    console.log('Button text:', buttonText);

    // テキストの一部が含まれていることを確認（より柔軟な検証）
    // 「Googleでログイン」または「Sign in with Google」などの文字列が含まれていれば合格
    expect(buttonText?.includes('Google')).toBeTruthy();
  });
});
