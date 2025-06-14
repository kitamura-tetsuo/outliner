// Mocha テストセットアップファイル
const admin = require("firebase-admin");

// Firebase Admin SDK のテスト用初期化
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "test-project-id",
  });
}

// テスト用のFirestoreエミュレーターを使用
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

// グローバルなテストタイムアウトを設定（Mochaの場合）
// this.timeout(30000); // 個別のテストで設定
