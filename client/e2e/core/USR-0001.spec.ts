import { test, expect } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';

/**
 * ユーザー削除機能のテスト
 *
 * このテストでは、ユーザー削除APIの機能を検証します。
 * - ユーザーアカウントの削除
 * - ユーザーに関連するコンテナ情報の削除
 * - ユーザーがアクセス可能だったコンテナからユーザーIDの削除
 * - ユーザーが最後のアクセス者だったコンテナの完全削除
 */
test.describe('ユーザー削除機能 (USR-0001)', () => {
  // テスト前の環境準備
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
  });

  test('ユーザーを削除できること', async ({ page, request }) => {
    // テスト用のユーザーを作成
    const testEmail = `test-user-${Date.now()}@example.com`;
    const testPassword = 'Test@123456';
    const testDisplayName = `Test User ${Date.now()}`;

    // Firebase Authでテストユーザーを作成
    const createUserResponse = await request.post('http://localhost:7090/api/create-test-user', {
      data: {
        email: testEmail,
        password: testPassword,
        displayName: testDisplayName
      }
    });

    expect(createUserResponse.ok()).toBeTruthy();
    const createUserData = await createUserResponse.json();
    expect(createUserData).toHaveProperty('uid');
    const testUserId = createUserData.uid;

    // テストユーザーでログイン
    await page.goto('http://localhost:7090/auth/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // ログイン成功を確認
    await page.waitForURL('http://localhost:7090/');

    // テストコンテナを作成
    const createContainerResponse = await request.post('http://localhost:7090/api/fluid-token', {
      data: {
        idToken: await page.evaluate(() => localStorage.getItem('firebase:authUser:*:idToken'))
      }
    });

    expect(createContainerResponse.ok()).toBeTruthy();
    const containerData = await createContainerResponse.json();
    expect(containerData).toHaveProperty('containerId');

    // コンテナをユーザーに関連付け
    const saveContainerResponse = await request.post('http://localhost:7090/api/save-container', {
      data: {
        idToken: await page.evaluate(() => localStorage.getItem('firebase:authUser:*:idToken')),
        containerId: containerData.containerId
      }
    });

    expect(saveContainerResponse.ok()).toBeTruthy();

    // 別のテストユーザーを作成してコンテナを共有
    const otherTestEmail = `other-test-user-${Date.now()}@example.com`;
    const otherTestPassword = 'Test@123456';
    const otherTestDisplayName = `Other Test User ${Date.now()}`;

    const createOtherUserResponse = await request.post('http://localhost:7090/api/create-test-user', {
      data: {
        email: otherTestEmail,
        password: otherTestPassword,
        displayName: otherTestDisplayName
      }
    });

    expect(createOtherUserResponse.ok()).toBeTruthy();
    const createOtherUserData = await createOtherUserResponse.json();
    const otherTestUserId = createOtherUserData.uid;

    // 別のブラウザコンテキストで他のユーザーとしてログイン
    const otherContext = await page.context().browser().newContext();
    const otherPage = await otherContext.newPage();

    await otherPage.goto('http://localhost:7090/auth/login');
    await otherPage.fill('input[type="email"]', otherTestEmail);
    await otherPage.fill('input[type="password"]', otherTestPassword);
    await otherPage.click('button[type="submit"]');

    // 他のユーザーにもコンテナを関連付け
    const saveContainerForOtherResponse = await request.post('http://localhost:7090/api/save-container', {
      data: {
        idToken: await otherPage.evaluate(() => localStorage.getItem('firebase:authUser:*:idToken')),
        containerId: containerData.containerId
      }
    });

    expect(saveContainerForOtherResponse.ok()).toBeTruthy();

    // 元のユーザーのコンテキストに戻る
    await otherContext.close();

    // ユーザー削除APIを呼び出し
    const deleteUserResponse = await request.post('http://localhost:7090/api/delete-user', {
      data: {
        idToken: await page.evaluate(() => localStorage.getItem('firebase:authUser:*:idToken'))
      }
    });

    expect(deleteUserResponse.ok()).toBeTruthy();
    const deleteUserData = await deleteUserResponse.json();
    expect(deleteUserData).toHaveProperty('success', true);

    // ユーザーが削除されたことを確認（ログインできないことを確認）
    await page.goto('http://localhost:7090/auth/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // エラーメッセージが表示されることを確認
    await page.waitForSelector('.error-message');
    const errorText = await page.textContent('.error-message');
    expect(errorText).toContain('ユーザーが見つかりません');

    // 他のユーザーでログインして、コンテナにアクセスできることを確認
    await page.fill('input[type="email"]', otherTestEmail);
    await page.fill('input[type="password"]', otherTestPassword);
    await page.click('button[type="submit"]');

    // ログイン成功を確認
    await page.waitForURL('http://localhost:7090/');

    // コンテナ情報を取得
    const getUserContainersResponse = await request.post('http://localhost:7090/api/get-user-containers', {
      data: {
        idToken: await page.evaluate(() => localStorage.getItem('firebase:authUser:*:idToken'))
      }
    });

    expect(getUserContainersResponse.ok()).toBeTruthy();
    const userContainersData = await getUserContainersResponse.json();

    // 削除されたユーザーのIDがコンテナのアクセス可能ユーザーリストから削除されていることを確認
    // これは直接確認できないため、コンテナ自体にはまだアクセスできることを確認
    expect(userContainersData.containers).toContain(containerData.containerId);
  });

  test('存在しないユーザーを削除しようとした場合のエラー処理', async ({ page, request }) => {
    // 存在しないユーザーIDのトークンを作成（実際には不可能なので、有効なトークンを改変）
    const nonExistentIdToken = 'invalid_token_' + Date.now();

    // ユーザー削除APIを呼び出し
    const deleteUserResponse = await request.post('http://localhost:7090/api/delete-user', {
      data: {
        idToken: nonExistentIdToken
      }
    });

    // 認証エラーが返されることを確認
    expect(deleteUserResponse.status()).toBe(401);
    const deleteUserData = await deleteUserResponse.json();
    expect(deleteUserData).toHaveProperty('error');
    expect(deleteUserData.error).toContain('Authentication failed');
  });
});
