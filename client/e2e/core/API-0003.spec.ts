import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase 管理者チェック機能
 * @description /api/get-container-users が管理者のみアクセス可能であることを確認する
 */

test.describe("管理者チェック (API-0003)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("無効なトークンでは認証エラーが返る", async ({ page }) => {
        // 無効なトークンでAPIを呼び出し、認証エラーが返ることを確認
        const response = await page.request.post("http://localhost:7091/api/get-container-users", {
            data: { idToken: "invalid-token", containerId: "test-container" },
        });

        // 無効なトークンの場合、Firebase認証エラーが返る（通常は500エラー）
        expect(response.status()).toBe(500);
    });

    test("containerId未指定では400が返る", async ({ page }) => {
        // containerIdを指定せずにAPIを呼び出し、400エラーが返ることを確認
        const response = await page.request.post("http://localhost:7091/api/get-container-users", {
            data: { idToken: "any-token" },
        });

        expect(response.status()).toBe(400);

        const responseBody = await response.json();
        expect(responseBody.error).toBe("Container ID is required");
    });
});
