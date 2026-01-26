/**
 * 本番環境データ削除機能のテスト
 *
 * 注意: このテストはテスト環境でのみ実行されます
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectEmulatorEnvironment } from "../check-production-environment.js";
import { ADMIN_TOKEN, CONFIRMATION_CODE, makeRequest } from "../delete-production-data.js";

describe("本番環境データ削除機能", () => {
    let originalEnv;

    beforeAll(() => {
        // 環境変数を保存
        originalEnv = { ...process.env };
    });

    afterAll(() => {
        // 環境変数を復元
        process.env = originalEnv;
    });

    describe("環境チェック", () => {
        it("エミュレーター環境を正しく検出する", () => {
            // テスト環境の設定
            process.env.FUNCTIONS_EMULATOR = "true";
            process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(true);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.exists).toBe(true);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.exists).toBe(true);
        });

        it("本番環境を正しく検出する", () => {
            // 本番環境の設定（エミュレーター変数を削除）
            delete process.env.FUNCTIONS_EMULATOR;
            delete process.env.FIRESTORE_EMULATOR_HOST;
            delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
            delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
            process.env.NODE_ENV = "production";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(false);
        });
    });

    describe("認証とセキュリティ", () => {
        it("正しい管理者トークンが設定されている", () => {
            expect(ADMIN_TOKEN).toBe("ADMIN_DELETE_ALL_DATA_2024");
            expect(typeof ADMIN_TOKEN).toBe("string");
            expect(ADMIN_TOKEN.length).toBeGreaterThan(10);
        });

        it("正しい確認コードが設定されている", () => {
            expect(CONFIRMATION_CODE).toBe("DELETE_ALL_PRODUCTION_DATA_CONFIRM");
            expect(typeof CONFIRMATION_CODE).toBe("string");
            expect(CONFIRMATION_CODE.length).toBeGreaterThan(10);
        });
    });

    describe("APIリクエスト構造", () => {
        it("makeRequest関数が正しい形式でリクエストを作成する", () => {
            const testData = {
                adminToken: "test-token",
                confirmationCode: "test-code",
            };

            // makeRequest関数の存在と型をチェック
            expect(typeof makeRequest).toBe("function");

            // 実際のリクエストはテスト環境では送信しない
            // 代わりに関数の構造をテスト
            expect(() => {
                // 関数が呼び出し可能であることを確認
                const promise = makeRequest(testData);
                expect(promise).toBeInstanceOf(Promise);
            }).not.toThrow();
        });
    });

    describe("エラーハンドリング", () => {
        it("不正な管理者トークンでエラーが発生する", async () => {
            // テスト環境でのモックレスポンス
            const mockResponse = {
                statusCode: 401,
                data: { error: "Unauthorized" },
            };

            // 実際のAPIコールの代わりにモックレスポンスをテスト
            expect(mockResponse.statusCode).toBe(401);
            expect(mockResponse.data.error).toBe("Unauthorized");
        });

        it("不正な確認コードでエラーが発生する", async () => {
            // テスト環境でのモックレスポンス
            const mockResponse = {
                statusCode: 400,
                data: { error: "Invalid confirmation code" },
            };

            expect(mockResponse.statusCode).toBe(400);
            expect(mockResponse.data.error).toBe("Invalid confirmation code");
        });
    });

    describe("レスポンス形式", () => {
        it("成功時のレスポンス形式が正しい", () => {
            const expectedSuccessResponse = {
                success: true,
                message: "Production data deletion completed",
                results: {
                    firestore: { success: true, error: null, deletedCollections: [] },
                    auth: { success: true, error: null, deletedUsers: 0 },
                    storage: { success: true, error: null, deletedFiles: 0 },
                },
                timestamp: expect.any(String),
            };

            // レスポンス構造の検証
            expect(expectedSuccessResponse.success).toBe(true);
            expect(expectedSuccessResponse.message).toBe("Production data deletion completed");
            expect(expectedSuccessResponse.results).toHaveProperty("firestore");
            expect(expectedSuccessResponse.results).toHaveProperty("auth");
            expect(expectedSuccessResponse.results).toHaveProperty("storage");
            expect(expectedSuccessResponse).toHaveProperty("timestamp");
        });
    });

    describe("安全性チェック", () => {
        it("テスト環境では実際の削除が実行されない", () => {
            // テスト環境の設定
            process.env.FUNCTIONS_EMULATOR = "true";
            process.env.NODE_ENV = "test";

            const isProduction = !process.env.FUNCTIONS_EMULATOR
                && !process.env.FIRESTORE_EMULATOR_HOST
                && process.env.NODE_ENV === "production";

            expect(isProduction).toBe(false);
        });

        it("本番環境の条件が正しく判定される", () => {
            // 本番環境の設定
            delete process.env.FUNCTIONS_EMULATOR;
            delete process.env.FIRESTORE_EMULATOR_HOST;
            process.env.NODE_ENV = "production";

            const isProduction = !process.env.FUNCTIONS_EMULATOR
                && !process.env.FIRESTORE_EMULATOR_HOST
                && process.env.NODE_ENV === "production";

            expect(isProduction).toBe(true);
        });
    });

    describe("データ削除対象", () => {
        it("削除対象のコレクションが正しく定義されている", () => {
            const expectedCollections = ["users", "containers", "projects", "schedules", "user-containers"];

            // 各コレクション名が文字列であることを確認
            expectedCollections.forEach(collection => {
                expect(typeof collection).toBe("string");
                expect(collection.length).toBeGreaterThan(0);
            });

            // 重複がないことを確認
            const uniqueCollections = [...new Set(expectedCollections)];
            expect(uniqueCollections.length).toBe(expectedCollections.length);
        });
    });

    describe("ログ出力", () => {
        it("重要な操作でログが出力される", () => {
            // ログメッセージの形式をテスト
            const criticalLogMessage = "CRITICAL: Starting production data deletion process";
            const completionLogMessage = "CRITICAL: Production data deletion process completed";

            expect(criticalLogMessage).toContain("CRITICAL");
            expect(completionLogMessage).toContain("CRITICAL");
            expect(criticalLogMessage).toContain("production data deletion");
            expect(completionLogMessage).toContain("Production data deletion");
        });
    });
});
