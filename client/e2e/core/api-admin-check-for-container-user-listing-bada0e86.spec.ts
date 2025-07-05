/** @feature API-0003
 *  Title   : Admin check for container user listing
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @testcase 管理者チェック機能
 * @description Firebase Functions getContainerUsers が管理者のみアクセス可能であることを確認する
 */

test.describe("管理者チェック (API-0003)", () => {
    // APIテストのみなので、TestHelpers.prepareTestEnvironmentは不要

    test("無効なトークンでは認証エラーが返る", async ({ page }) => {
        // 無効なトークンでFirebase Functions APIを呼び出し、認証エラーが返ることを確認
        const response = await page.request.post("http://localhost:57000/api/get-container-users", {
            data: { idToken: "invalid-token", containerId: "test-container" },
        });

        // 無効なトークンの場合、Firebase認証エラーが返る（通常は401エラー）
        expect(response.status()).toBe(401);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("Authentication failed");
    });

    test("containerId未指定では400が返る", async ({ page }) => {
        // containerIdを指定せずにFirebase Functions APIを呼び出し、400エラーが返ることを確認
        const response = await page.request.post("http://localhost:57000/api/get-container-users", {
            data: { idToken: "any-token" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("Container ID is required");
    });

    test("IDトークンが未指定では400が返る", async ({ page }) => {
        // IDトークンを指定せずにFirebase Functions APIを呼び出し、400エラーが返ることを確認
        const response = await page.request.post("http://localhost:57000/api/get-container-users", {
            data: { containerId: "test-container" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("ID token required");
    });

    test("空のIDトークンでは400が返る", async ({ page }) => {
        // 空のIDトークンでFirebase Functions APIを呼び出し、400エラーが返ることを確認
        const response = await page.request.post("http://localhost:57000/api/get-container-users", {
            data: { idToken: "", containerId: "test-container" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("ID token required");
    });
});
