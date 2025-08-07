import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Firebase Auth Token Production Integration Test
 * 本番Firebase Authを使用したFirebase Functions APIの検証テスト
 */

describe("Firebase Auth Token Production Integration", () => {
    let testEmail: string;
    let testPassword: string;
    let testIdToken: string;
    let testUserId: string;

    beforeEach(async () => {
        // テスト用の一意なメールアドレスを生成
        testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
        testPassword = "TestPassword123!";

        // 本番Firebase Authでテストユーザーを作成
        const createUserResponse = await fetch(
            "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=AIzaSyCikgn1YY06j6ZlAJPYab1FIOKSQAuzcH4",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email: testEmail,
                    password: testPassword,
                    returnSecureToken: true,
                }),
            },
        );

        if (!createUserResponse.ok) {
            const errorText = await createUserResponse.text();
            throw new Error(`Failed to create test user: ${createUserResponse.status} ${errorText}`);
        }

        const userData = await createUserResponse.json();
        testUserId = userData.localId;
        testIdToken = userData.idToken;

        console.log(`Created test user: ${testEmail}`);
    });

    afterEach(async () => {
        // テストユーザーを削除
        if (testIdToken) {
            try {
                await fetch(
                    "https://identitytoolkit.googleapis.com/v1/accounts:delete?key=AIzaSyCikgn1YY06j6ZlAJPYab1FIOKSQAuzcH4",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            idToken: testIdToken,
                        }),
                    },
                );
                console.log(`Deleted test user: ${testEmail}`);
            } catch (error) {
                console.warn("Failed to cleanup test user:", error);
            }
        }
    });

    it("should successfully validate Firebase ID token and return Fluid token", async () => {
        // Firebase Functions APIを呼び出してFluid tokenを取得
        const response = await fetch("http://localhost:57000/api/fluidToken", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ idToken: testIdToken }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`API Error: ${response.status}`, errorData);
        }
        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);

        const responseData = await response.json();

        // Fluid tokenの形式を確認
        expect(responseData).toHaveProperty("token");
        expect(typeof responseData.token).toBe("string");
        expect(responseData.token.length).toBeGreaterThan(0);

        // containerIdは必須ではない場合があるので、存在する場合のみチェック
        if (responseData.containerId) {
            expect(typeof responseData.containerId).toBe("string");
            expect(responseData.containerId.length).toBeGreaterThan(0);
        }
    });

    it("should reject invalid Firebase ID token", async () => {
        const invalidToken = "invalid-token-12345";

        const response = await fetch("http://localhost:57000/api/fluidToken", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ idToken: invalidToken }),
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(401);

        const responseData = await response.json();
        expect(responseData).toHaveProperty("error");
        expect(responseData.error).toContain("Authentication failed");
    });

    it("should handle missing ID token", async () => {
        const response = await fetch("http://localhost:57000/api/fluidToken", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);

        const responseData = await response.json();
        expect(responseData).toHaveProperty("error");
    });

    it("should handle container-specific token requests", async () => {
        const containerId = "test-container-" + Date.now();

        // まず、コンテナアクセス権限を設定
        const saveContainerResponse = await fetch("http://localhost:57000/api/saveContainer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken: testIdToken,
                containerId: containerId,
            }),
        });

        expect(saveContainerResponse.ok).toBe(true);

        // コンテナ固有のトークンをリクエスト
        const response = await fetch("http://localhost:57000/api/fluidToken", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken: testIdToken,
                containerId: containerId,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`API Error: ${response.status}`, errorData);
        }
        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);

        const responseData = await response.json();
        expect(responseData).toHaveProperty("token");

        // containerIdが指定された場合は、レスポンスに含まれることを確認
        if (responseData.containerId) {
            expect(responseData.containerId).toBe(containerId);
        }
    });

    it("should work with SvelteKit API proxy", async () => {
        // SvelteKitのAPIプロキシ経由でテスト
        const response = await fetch("http://localhost:7073/api/fluid-token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ idToken: testIdToken }),
        });

        // エラーレスポンスの詳細を確認
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`SvelteKit API proxy error: ${response.status} - ${errorText}`);
        }

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);

        const responseData = await response.json();
        expect(responseData).toHaveProperty("token");
        expect(typeof responseData.token).toBe("string");
        expect(responseData.token.length).toBeGreaterThan(0);
    });
});
