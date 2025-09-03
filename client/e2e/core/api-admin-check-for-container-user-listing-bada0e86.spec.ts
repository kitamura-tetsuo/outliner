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
        // Firebase Hostingエミュレーターのヘルスチェック
        try {
            const healthResponse = await page.request.get("http://localhost:57000/api/health");
            console.log(`Health check status: ${healthResponse.status()}`);
            if (healthResponse.status() !== 200) {
                console.log("Health check failed, Firebase Hosting emulator may not be running properly");
            }
        } catch (error) {
            console.log(`Health check error: ${error.message}`);
        }

        // まずFirebase Hostingエミュレーター経由でアクセスを試行
        let response = await page.request.post("http://localhost:57000/api/adminCheckForContainerUserListing", {
            data: { idToken: "invalid-token", containerId: "test-container" },
        });

        // デバッグ情報を出力
        console.log(`Hosting response status: ${response.status()}`);
        console.log(`Hosting response headers:`, response.headers());

        // 404エラーの場合、直接Firebase Functionsエミュレーターにアクセス
        if (response.status() === 404) {
            console.log("Hosting emulator returned 404, trying direct Functions emulator access");

            // まずFunctions エミュレーターのヘルスチェック
            try {
                const functionsHealthResponse = await page.request.get(
                    "http://localhost:57070/outliner-d57b0/us-central1/health",
                );
                console.log(`Functions health check status: ${functionsHealthResponse.status()}`);
            } catch (error) {
                console.log(`Functions health check error: ${error.message}`);
            }

            response = await page.request.post(
                "http://localhost:57070/outliner-d57b0/us-central1/adminCheckForContainerUserListing",
                {
                    data: { idToken: "invalid-token", containerId: "test-container" },
                },
            );
            console.log(`Functions response status: ${response.status()}`);
            console.log(`Functions response headers:`, response.headers());
        }

        let responseBody;
        try {
            responseBody = await response.json();
            console.log(`Response body:`, responseBody);
        } catch (error) {
            const textBody = await response.text();
            console.log(`Response text:`, textBody);
            console.log(`JSON parse error:`, error.message);
        }

        // 無効なトークンの場合、Firebase認証エラーが返る（通常は401エラー）
        expect(response.status()).toBe(401);

        expect(responseBody.error).toBe("Authentication failed");
    });

    test("containerId未指定では400が返る", async ({ page }) => {
        // containerIdを指定せずにFirebase Functions APIを呼び出し、400エラーが返ることを確認
        const response = await page.request.post("http://localhost:57000/api/adminCheckForContainerUserListing", {
            data: { idToken: "any-token" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("Container ID is required");
    });

    test("IDトークンが未指定では400が返る", async ({ page }) => {
        // IDトークンを指定せずにFirebase Functions APIを呼び出し、400エラーが返ることを確認
        const response = await page.request.post("http://localhost:57000/api/adminCheckForContainerUserListing", {
            data: { containerId: "test-container" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("ID token required");
    });

    test("空のIDトークンでは400が返る", async ({ page }) => {
        // 空のIDトークンでFirebase Functions APIを呼び出し、400エラーが返ることを確認
        const response = await page.request.post("http://localhost:57000/api/adminCheckForContainerUserListing", {
            data: { idToken: "", containerId: "test-container" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("ID token required");
    });
});
import "../utils/registerAfterEachSnapshot";
import "../utils/registerAfterEachSnapshot";
