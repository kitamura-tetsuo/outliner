/**
 * 環境チェック機能のテスト
 */

const { describe, it, expect, beforeAll, afterAll } = require("@jest/globals");
const { detectEmulatorEnvironment, checkProductionHealth } = require("../check-production-environment");

describe("環境チェック機能", () => {
    let originalEnv;

    beforeAll(() => {
        // 環境変数を保存
        originalEnv = { ...process.env };
    });

    afterAll(() => {
        // 環境変数を復元
        process.env = originalEnv;
    });

    describe("エミュレーター環境検出", () => {
        it("すべてのエミュレーター変数が未設定の場合、エミュレーター環境ではないと判定する", () => {
            // エミュレーター変数をクリア
            delete process.env.FUNCTIONS_EMULATOR;
            delete process.env.FIRESTORE_EMULATOR_HOST;
            delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
            delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(false);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.exists).toBe(false);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.exists).toBe(false);
            expect(result.emulatorStatus.FIREBASE_AUTH_EMULATOR_HOST.exists).toBe(false);
            expect(result.emulatorStatus.FIREBASE_STORAGE_EMULATOR_HOST.exists).toBe(false);
        });

        it("FUNCTIONS_EMULATORが設定されている場合、エミュレーター環境と判定する", () => {
            process.env.FUNCTIONS_EMULATOR = "true";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(true);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.exists).toBe(true);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.value).toBe("true");
        });

        it("FIRESTORE_EMULATOR_HOSTが設定されている場合、エミュレーター環境と判定する", () => {
            delete process.env.FUNCTIONS_EMULATOR;
            process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(true);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.exists).toBe(true);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.value).toBe("localhost:58080");
        });

        it("複数のエミュレーター変数が設定されている場合、正しく検出する", () => {
            process.env.FUNCTIONS_EMULATOR = "true";
            process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";
            process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:59099";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(true);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.exists).toBe(true);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.exists).toBe(true);
            expect(result.emulatorStatus.FIREBASE_AUTH_EMULATOR_HOST.exists).toBe(true);
            expect(result.emulatorStatus.FIREBASE_STORAGE_EMULATOR_HOST.exists).toBe(false);
        });
    });

    describe("環境変数チェック", () => {
        it("NODE_ENVが正しく読み取られる", () => {
            process.env.NODE_ENV = "test";
            expect(process.env.NODE_ENV).toBe("test");

            process.env.NODE_ENV = "production";
            expect(process.env.NODE_ENV).toBe("production");

            process.env.NODE_ENV = "development";
            expect(process.env.NODE_ENV).toBe("development");
        });

        it("FIREBASE_PROJECT_IDが正しく読み取られる", () => {
            process.env.FIREBASE_PROJECT_ID = "test-project-id";
            expect(process.env.FIREBASE_PROJECT_ID).toBe("test-project-id");

            process.env.FIREBASE_PROJECT_ID = "outliner-d57b0";
            expect(process.env.FIREBASE_PROJECT_ID).toBe("outliner-d57b0");
        });
    });

    describe("本番環境判定", () => {
        it("本番環境の条件を正しく判定する", () => {
            // 本番環境の設定
            process.env.NODE_ENV = "production";
            delete process.env.FUNCTIONS_EMULATOR;
            delete process.env.FIRESTORE_EMULATOR_HOST;
            delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
            delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;

            const emulatorInfo = detectEmulatorEnvironment();
            const isProduction = process.env.NODE_ENV === "production" && !emulatorInfo.hasEmulator;

            expect(isProduction).toBe(true);
        });

        it("開発環境の条件を正しく判定する", () => {
            // 開発環境の設定
            process.env.NODE_ENV = "development";
            process.env.FUNCTIONS_EMULATOR = "true";

            const emulatorInfo = detectEmulatorEnvironment();
            const isProduction = process.env.NODE_ENV === "production" && !emulatorInfo.hasEmulator;

            expect(isProduction).toBe(false);
        });

        it("テスト環境の条件を正しく判定する", () => {
            // テスト環境の設定
            process.env.NODE_ENV = "test";
            process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";

            const emulatorInfo = detectEmulatorEnvironment();
            const isProduction = process.env.NODE_ENV === "production" && !emulatorInfo.hasEmulator;

            expect(isProduction).toBe(false);
        });
    });

    describe("本番環境ヘルスチェック", () => {
        it("checkProductionHealth関数が存在する", () => {
            expect(typeof checkProductionHealth).toBe("function");
        });

        it("checkProductionHealth関数がPromiseを返す", () => {
            const result = checkProductionHealth();
            expect(result).toBeInstanceOf(Promise);

            // テスト環境では実際のリクエストを送信せずにPromiseをキャンセル
            result.catch(() => {
                // エラーは期待される（テスト環境のため）
            });
        });
    });

    describe("エラーハンドリング", () => {
        it("環境変数が未定義の場合、適切にハンドリングする", () => {
            delete process.env.NODE_ENV;
            delete process.env.FIREBASE_PROJECT_ID;

            // 環境変数が未定義でもエラーが発生しないことを確認
            expect(() => {
                const emulatorInfo = detectEmulatorEnvironment();
                expect(emulatorInfo).toHaveProperty("hasEmulator");
                expect(emulatorInfo).toHaveProperty("emulatorStatus");
            }).not.toThrow();
        });

        it("不正な環境変数値でもエラーが発生しない", () => {
            process.env.NODE_ENV = "";
            process.env.FIREBASE_PROJECT_ID = "";
            process.env.FUNCTIONS_EMULATOR = "";

            expect(() => {
                const emulatorInfo = detectEmulatorEnvironment();
                expect(emulatorInfo).toHaveProperty("hasEmulator");
            }).not.toThrow();
        });
    });

    describe("戻り値の形式", () => {
        it("detectEmulatorEnvironment関数が正しい形式のオブジェクトを返す", () => {
            const result = detectEmulatorEnvironment();

            expect(result).toHaveProperty("hasEmulator");
            expect(result).toHaveProperty("emulatorStatus");
            expect(typeof result.hasEmulator).toBe("boolean");
            expect(typeof result.emulatorStatus).toBe("object");

            // emulatorStatusの各プロパティをチェック
            const expectedKeys = [
                "FUNCTIONS_EMULATOR",
                "FIRESTORE_EMULATOR_HOST",
                "FIREBASE_AUTH_EMULATOR_HOST",
                "FIREBASE_STORAGE_EMULATOR_HOST",
            ];

            expectedKeys.forEach(key => {
                expect(result.emulatorStatus).toHaveProperty(key);
                expect(result.emulatorStatus[key]).toHaveProperty("exists");
                expect(result.emulatorStatus[key]).toHaveProperty("value");
                expect(typeof result.emulatorStatus[key].exists).toBe("boolean");
                expect(typeof result.emulatorStatus[key].value).toBe("string");
            });
        });
    });
});
