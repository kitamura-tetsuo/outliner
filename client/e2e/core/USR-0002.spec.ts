/** @feature USR-0002 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * コンテナ削除機能のテスト
 *
 * このテストでは、コンテナ削除APIの機能を検証します。
 * - コンテナの削除
 * - コンテナにアクセス可能だったユーザーのアクセス権からコンテナIDの削除
 * - コンテナがデフォルトコンテナだった場合のユーザーのデフォルトコンテナの更新
 * - コンテナが存在しない場合のエラー処理
 * - コンテナへのアクセス権がない場合のエラー処理
 */
test.describe("コンテナ削除機能 (USR-0002)", () => {
    // テスト前の環境準備
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    const host = process.env.VITE_HOST || "localhost";
    const port = process.env.VITE_PORT || "7090";
    const apiHost = process.env.VITE_FIREBASE_FUNCTIONS_HOST || host;
    const apiPort = process.env.VITE_FIREBASE_FUNCTIONS_PORT || "57070";
    const clientBase = `http://${host}:${port}`;
    const baseUrl = process.env.VITE_FIREBASE_FUNCTIONS_URL || `http://${apiHost}:${apiPort}`;

    test("コンテナを削除できること", async ({ page, request }) => {
        // テスト用のユーザーを作成
        const testEmail = `test-user-${Date.now()}@example.com`;
        const testPassword = "Test@123456";
        const testDisplayName = `Test User ${Date.now()}`;

        // Firebase Authでテストユーザーを作成
        const createUserResponse = await request.post(`${baseUrl}/api/create-test-user`, {
            data: {
                email: testEmail,
                password: testPassword,
                displayName: testDisplayName,
            },
        });

        expect(createUserResponse.ok()).toBeTruthy();
        const createUserData = await createUserResponse.json();
        expect(createUserData).toHaveProperty("uid");
        const testUserId = createUserData.uid;

        // 別のテストユーザーを作成
        const otherTestEmail = `other-test-user-${Date.now()}@example.com`;
        const otherTestPassword = "Test@123456";
        const otherTestDisplayName = `Other Test User ${Date.now()}`;

        const createOtherUserResponse = await request.post(`${baseUrl}/api/create-test-user`, {
            data: {
                email: otherTestEmail,
                password: otherTestPassword,
                displayName: otherTestDisplayName,
            },
        });

        expect(createOtherUserResponse.ok()).toBeTruthy();
        const createOtherUserData = await createOtherUserResponse.json();
        const otherTestUserId = createOtherUserData.uid;

        // テストユーザーでログイン
        await page.goto(`${clientBase}/auth/login`);
        await page.fill('input[type="email"]', testEmail);
        await page.fill('input[type="password"]', testPassword);
        await page.click('button[type="submit"]');

        // ログイン成功を確認
        await page.waitForURL(`${clientBase}/`);

        // テストコンテナを作成
        const createContainerResponse = await request.post(`${baseUrl}/api/fluid-token`, {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
            },
        });

        expect(createContainerResponse.ok()).toBeTruthy();
        const containerData = await createContainerResponse.json();
        expect(containerData).toHaveProperty("containerId");
        const containerToDelete = containerData.containerId;

        // コンテナをユーザーに関連付け
        const saveContainerResponse = await request.post(`${baseUrl}/api/save-container`, {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
                containerId: containerToDelete,
            },
        });

        expect(saveContainerResponse.ok()).toBeTruthy();

        // 別のコンテナも作成して関連付け（デフォルトコンテナ更新のテスト用）
        const createContainer2Response = await request.post("${clientBase}/api/fluid-token", {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
            },
        });

        expect(createContainer2Response.ok()).toBeTruthy();
        const container2Data = await createContainer2Response.json();
        expect(container2Data).toHaveProperty("containerId");

        const saveContainer2Response = await request.post("${clientBase}/api/save-container", {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
                containerId: container2Data.containerId,
            },
        });

        expect(saveContainer2Response.ok()).toBeTruthy();

        // 別のブラウザコンテキストで他のユーザーとしてログイン
        const otherContext = await page.context().browser().newContext();
        const otherPage = await otherContext.newPage();

        await otherPage.goto("${clientBase}/auth/login");
        await otherPage.fill('input[type="email"]', otherTestEmail);
        await otherPage.fill('input[type="password"]', otherTestPassword);
        await otherPage.click('button[type="submit"]');

        // 他のユーザーにも削除予定のコンテナを関連付け
        const saveContainerForOtherResponse = await request.post("${clientBase}/api/save-container", {
            data: {
                idToken: await otherPage.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
                containerId: containerToDelete,
            },
        });

        expect(saveContainerForOtherResponse.ok()).toBeTruthy();

        // 元のユーザーのコンテキストに戻る
        await otherContext.close();

        // コンテナ削除APIを呼び出し
        const deleteContainerResponse = await request.post("${clientBase}/api/delete-container", {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
                containerId: containerToDelete,
            },
        });

        expect(deleteContainerResponse.ok()).toBeTruthy();
        const deleteContainerData = await deleteContainerResponse.json();
        expect(deleteContainerData).toHaveProperty("success", true);

        // ユーザーのコンテナリストを取得して、削除したコンテナが含まれていないことを確認
        const getUserContainersResponse = await request.post("${clientBase}/api/get-user-containers", {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
            },
        });

        expect(getUserContainersResponse.ok()).toBeTruthy();
        const userContainersData = await getUserContainersResponse.json();
        expect(userContainersData.containers).not.toContain(containerToDelete);
        expect(userContainersData.containers).toContain(container2Data.containerId);

        // デフォルトコンテナが更新されていることを確認
        expect(userContainersData.defaultContainerId).toBe(container2Data.containerId);

        // 他のユーザーでログインして、コンテナリストを確認
        await page.goto("${clientBase}/auth/login");
        await page.fill('input[type="email"]', otherTestEmail);
        await page.fill('input[type="password"]', otherTestPassword);
        await page.click('button[type="submit"]');

        // ログイン成功を確認
        await page.waitForURL("${clientBase}/");

        // 他のユーザーのコンテナリストを取得
        const getOtherUserContainersResponse = await request.post("${clientBase}/api/get-user-containers", {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
            },
        });

        expect(getOtherUserContainersResponse.ok()).toBeTruthy();
        const otherUserContainersData = await getOtherUserContainersResponse.json();

        // 他のユーザーのコンテナリストからも削除されていることを確認
        expect(otherUserContainersData.containers).not.toContain(containerToDelete);

        // 他のユーザーのデフォルトコンテナが更新されていることを確認
        expect(otherUserContainersData.defaultContainerId).toBeNull();
    });

    test("存在しないコンテナを削除しようとした場合のエラー処理", async ({ page, request }) => {
        // テスト用のユーザーを作成
        const testEmail = `test-user-${Date.now()}@example.com`;
        const testPassword = "Test@123456";
        const testDisplayName = `Test User ${Date.now()}`;

        // Firebase Authでテストユーザーを作成
        const createUserResponse = await request.post("${clientBase}/api/create-test-user", {
            data: {
                email: testEmail,
                password: testPassword,
                displayName: testDisplayName,
            },
        });

        expect(createUserResponse.ok()).toBeTruthy();

        // テストユーザーでログイン
        await page.goto("${clientBase}/auth/login");
        await page.fill('input[type="email"]', testEmail);
        await page.fill('input[type="password"]', testPassword);
        await page.click('button[type="submit"]');

        // ログイン成功を確認
        await page.waitForURL("${clientBase}/");

        // 存在しないコンテナIDを指定してコンテナ削除APIを呼び出し
        const nonExistentContainerId = "non-existent-container-" + Date.now();
        const deleteContainerResponse = await request.post("${clientBase}/api/delete-container", {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
                containerId: nonExistentContainerId,
            },
        });

        // 404エラーが返されることを確認
        expect(deleteContainerResponse.status()).toBe(404);
        const deleteContainerData = await deleteContainerResponse.json();
        expect(deleteContainerData).toHaveProperty("error");
        expect(deleteContainerData.error).toContain("Container not found");
    });

    test("アクセス権のないコンテナを削除しようとした場合のエラー処理", async ({ page, request }) => {
        // 2人のテストユーザーを作成
        const testEmail1 = `test-user1-${Date.now()}@example.com`;
        const testPassword1 = "Test@123456";
        const testDisplayName1 = `Test User 1 ${Date.now()}`;

        const testEmail2 = `test-user2-${Date.now()}@example.com`;
        const testPassword2 = "Test@123456";
        const testDisplayName2 = `Test User 2 ${Date.now()}`;

        // 1人目のユーザーを作成
        const createUser1Response = await request.post("${clientBase}/api/create-test-user", {
            data: {
                email: testEmail1,
                password: testPassword1,
                displayName: testDisplayName1,
            },
        });

        expect(createUser1Response.ok()).toBeTruthy();

        // 2人目のユーザーを作成
        const createUser2Response = await request.post("${clientBase}/api/create-test-user", {
            data: {
                email: testEmail2,
                password: testPassword2,
                displayName: testDisplayName2,
            },
        });

        expect(createUser2Response.ok()).toBeTruthy();

        // 1人目のユーザーでログイン
        await page.goto("${clientBase}/auth/login");
        await page.fill('input[type="email"]', testEmail1);
        await page.fill('input[type="password"]', testPassword1);
        await page.click('button[type="submit"]');

        // ログイン成功を確認
        await page.waitForURL("${clientBase}/");

        // 1人目のユーザーでコンテナを作成
        const createContainerResponse = await request.post("${clientBase}/api/fluid-token", {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
            },
        });

        expect(createContainerResponse.ok()).toBeTruthy();
        const containerData = await createContainerResponse.json();
        expect(containerData).toHaveProperty("containerId");
        const containerId = containerData.containerId;

        // コンテナをユーザーに関連付け
        const saveContainerResponse = await request.post("${clientBase}/api/save-container", {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
                containerId: containerId,
            },
        });

        expect(saveContainerResponse.ok()).toBeTruthy();

        // 2人目のユーザーでログイン
        await page.goto("${clientBase}/auth/login");
        await page.fill('input[type="email"]', testEmail2);
        await page.fill('input[type="password"]', testPassword2);
        await page.click('button[type="submit"]');

        // ログイン成功を確認
        await page.waitForURL("${clientBase}/");

        // 2人目のユーザーで1人目のユーザーのコンテナを削除しようとする
        const deleteContainerResponse = await request.post("${clientBase}/api/delete-container", {
            data: {
                idToken: await page.evaluate(() => localStorage.getItem("firebase:authUser:*:idToken")),
                containerId: containerId,
            },
        });

        // 403エラーが返されることを確認
        expect(deleteContainerResponse.status()).toBe(403);
        const deleteContainerData = await deleteContainerResponse.json();
        expect(deleteContainerData).toHaveProperty("error");
        expect(deleteContainerData.error).toContain("Access to the container is denied");
    });
});
