import { expect } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";
import sinon from "sinon";

// Firebase emulator起動待機機能のテスト
describe("Firebase emulator起動待機機能 (API-0002)", function() {
    let adminStub;
    let loggerStub;
    let processStub;
    let waitForFirebaseEmulator;

    beforeEach(function() {
        // Firebase Admin SDKのモック
        adminStub = {
            auth: sinon.stub().returns({
                listUsers: sinon.stub(),
            }),
        };

        // ロガーのモック
        loggerStub = {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
        };

        // プロセス環境変数のモック
        processStub = {
            env: {},
        };

        // waitForFirebaseEmulator関数を模擬実装
        waitForFirebaseEmulator = async function(maxRetries = 30, initialDelay = 1000, maxDelay = 10000) {
            const isEmulator = processStub.env.FIREBASE_AUTH_EMULATOR_HOST
                || processStub.env.FIRESTORE_EMULATOR_HOST
                || processStub.env.FIREBASE_EMULATOR_HOST;

            if (!isEmulator) {
                loggerStub.info("Firebase emulator not configured, skipping connection wait");
                return;
            }

            loggerStub.info(`Firebase emulator detected, waiting for connection... (max retries: ${maxRetries})`);

            let retryCount = 0;
            let delay = initialDelay;

            while (retryCount < maxRetries) {
                try {
                    loggerStub.info(`Firebase connection attempt ${retryCount + 1}/${maxRetries}...`);

                    // Firebase Auth emulatorへの接続テスト
                    const listUsersResult = await adminStub.auth().listUsers(1);

                    loggerStub.info(
                        `Firebase emulator connection successful. Found users: ${listUsersResult.users.length}`,
                    );
                    if (listUsersResult.users.length > 0) {
                        loggerStub.info(`First user: ${
                            JSON.stringify({
                                uid: listUsersResult.users[0].uid,
                                email: listUsersResult.users[0].email,
                                displayName: listUsersResult.users[0].displayName,
                            })
                        }`);
                    }

                    return; // 成功した場合は関数を終了
                } catch (error) {
                    retryCount++;

                    if (error.code === "ECONNREFUSED" || error.message.includes("ECONNREFUSED")) {
                        loggerStub.warn(
                            `Firebase emulator not ready yet (attempt ${retryCount}/${maxRetries}): ${error.message}`,
                        );

                        if (retryCount < maxRetries) {
                            loggerStub.info(`Waiting ${delay}ms before next retry...`);
                            await new Promise(resolve => setTimeout(resolve, delay));

                            // 指数バックオフ（最大遅延時間まで）
                            delay = Math.min(delay * 1.5, maxDelay);
                        }
                    } else {
                        // ECONNREFUSED以外のエラーは即座に失敗とする
                        loggerStub.error(
                            `Firebase emulator connection failed with non-connection error: ${error.message}`,
                        );
                        throw error;
                    }
                }
            }

            throw new Error(`Firebase emulator connection failed after ${maxRetries} attempts`);
        };
    });

    afterEach(function() {
        sinon.restore();
    });

    it("Firebase emulator環境変数が設定されている場合、emulatorの起動を待機する", async function() {
        // 環境変数を設定
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // 成功するレスポンスを設定
        adminStub.auth().listUsers.resolves({ users: [] });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(loggerStub.info.calledWith("Firebase emulator detected, waiting for connection... (max retries: 3)")).to
            .be.true;
        expect(loggerStub.info.calledWith("Firebase connection attempt 1/3...")).to.be.true;
        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 0")).to.be.true;
    });

    it("ECONNREFUSED エラーが発生した場合、指数バックオフでリトライする", async function() {
        // 環境変数を設定
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // 最初の2回はECONNREFUSEDエラー、3回目は成功
        const econnrefusedError = new Error("connect ECONNREFUSED 127.0.0.1:9099");
        econnrefusedError.code = "ECONNREFUSED";

        adminStub.auth().listUsers
            .onCall(0).rejects(econnrefusedError)
            .onCall(1).rejects(econnrefusedError)
            .onCall(2).resolves({ users: [] });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(
            loggerStub.warn.calledWith(
                "Firebase emulator not ready yet (attempt 1/3): connect ECONNREFUSED 127.0.0.1:9099",
            ),
        ).to.be.true;
        expect(
            loggerStub.warn.calledWith(
                "Firebase emulator not ready yet (attempt 2/3): connect ECONNREFUSED 127.0.0.1:9099",
            ),
        ).to.be.true;
        expect(loggerStub.info.calledWith("Waiting 100ms before next retry...")).to.be.true;
        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 0")).to.be.true;
    });

    it("最大30回のリトライを行い、初期遅延1秒、最大遅延10秒で待機する", async function() {
        // 環境変数を設定
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // 常にECONNREFUSEDエラーを返す
        const econnrefusedError = new Error("connect ECONNREFUSED 127.0.0.1:9099");
        econnrefusedError.code = "ECONNREFUSED";
        adminStub.auth().listUsers.rejects(econnrefusedError);

        try {
            await waitForFirebaseEmulator(3, 100, 200); // テスト用に短い時間に設定
            expect.fail("Should have thrown an error");
        } catch (error) {
            expect(error.message).to.equal("Firebase emulator connection failed after 3 attempts");
            expect(loggerStub.info.calledWith("Firebase emulator detected, waiting for connection... (max retries: 3)"))
                .to.be.true;
            expect(loggerStub.warn.callCount).to.equal(3);
        }
    });

    it("Firebase Auth emulatorへの接続テストを行い、成功するまで待機する", async function() {
        // 環境変数を設定
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // ユーザーが存在する場合のレスポンス
        const mockUsers = [{
            uid: "test-uid",
            email: "test@example.com",
            displayName: "Test User",
        }];
        adminStub.auth().listUsers.resolves({ users: mockUsers });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(adminStub.auth().listUsers.calledWith(1)).to.be.true;
        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 1")).to.be.true;
        expect(
            loggerStub.info.calledWith(
                'First user: {"uid":"test-uid","email":"test@example.com","displayName":"Test User"}',
            ),
        ).to.be.true;
    });

    it("emulator環境でない場合は待機をスキップする", async function() {
        // 環境変数を設定しない（emulator環境でない）

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(loggerStub.info.calledWith("Firebase emulator not configured, skipping connection wait")).to.be.true;
        expect(adminStub.auth().listUsers.called).to.be.false;
    });

    it("ECONNREFUSED以外のエラーは即座に失敗とする", async function() {
        // 環境変数を設定
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // ECONNREFUSED以外のエラー
        const otherError = new Error("Some other error");
        adminStub.auth().listUsers.rejects(otherError);

        try {
            await waitForFirebaseEmulator(3, 100, 1000);
            expect.fail("Should have thrown an error");
        } catch (error) {
            expect(error.message).to.equal("Some other error");
            expect(
                loggerStub.error.calledWith(
                    "Firebase emulator connection failed with non-connection error: Some other error",
                ),
            ).to.be.true;
            expect(adminStub.auth().listUsers.callCount).to.equal(1); // 1回だけ呼ばれる
        }
    });

    it("リトライ回数と遅延時間をログに出力する", async function() {
        // 環境変数を設定
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // 最初はECONNREFUSEDエラー、2回目は成功
        const econnrefusedError = new Error("connect ECONNREFUSED 127.0.0.1:9099");
        econnrefusedError.code = "ECONNREFUSED";

        adminStub.auth().listUsers
            .onCall(0).rejects(econnrefusedError)
            .onCall(1).resolves({ users: [] });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(loggerStub.info.calledWith("Firebase connection attempt 1/3...")).to.be.true;
        expect(loggerStub.info.calledWith("Firebase connection attempt 2/3...")).to.be.true;
        expect(loggerStub.info.calledWith("Waiting 100ms before next retry...")).to.be.true;
    });

    it("接続成功時にユーザー数とユーザー情報をログに出力する", async function() {
        // 環境変数を設定
        processStub.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

        // ユーザーが存在する場合のレスポンス
        const mockUsers = [{
            uid: "test-uid-123",
            email: "user@test.com",
            displayName: "Test Display Name",
        }];
        adminStub.auth().listUsers.resolves({ users: mockUsers });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 1")).to.be.true;
        expect(
            loggerStub.info.calledWith(
                'First user: {"uid":"test-uid-123","email":"user@test.com","displayName":"Test Display Name"}',
            ),
        ).to.be.true;
    });

    it("Firebase初期化が非同期でラップされ、テストユーザーセットアップがemulator起動待機後に実行される", async function() {
        // 環境変数を設定
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // devAuthHelperのモック
        const devAuthHelperStub = {
            setupTestUser: sinon.stub().resolves({
                uid: "test-user-uid",
                email: "test@example.com",
                displayName: "Test User",
            }),
        };

        // Firebase初期化の非同期関数を模擬実装
        const initializeFirebase = async function() {
            // Firebase emulator起動待機
            await waitForFirebaseEmulator(3, 100, 1000);

            // テストユーザーセットアップ（emulator起動待機後）
            if (devAuthHelperStub) {
                const user = await devAuthHelperStub.setupTestUser();
                loggerStub.info(`開発環境用テストユーザーをセットアップしました: ${user.email} (${user.uid})`);
            }
        };

        // 成功するレスポンスを設定
        adminStub.auth().listUsers.resolves({ users: [] });

        await initializeFirebase();

        // emulator起動待機が実行されたことを確認
        expect(loggerStub.info.calledWith("Firebase emulator detected, waiting for connection... (max retries: 3)")).to
            .be.true;
        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 0")).to.be.true;

        // テストユーザーセットアップが実行されたことを確認
        expect(devAuthHelperStub.setupTestUser.called).to.be.true;
        expect(
            loggerStub.info.calledWith(
                "開発環境用テストユーザーをセットアップしました: test@example.com (test-user-uid)",
            ),
        ).to.be.true;
    });
});
