// Development environment authentication setup script
import "dotenv/config";
import admin from "firebase-admin";
import { fileURLToPath } from "url";
import { serverLogger as logger } from "../src/utils/log-manager.js";

// Firebase Admin SDKの初期化
export async function initializeFirebase() {
    try {
        // Check if already initialized
        if (admin.apps.length === 0) {
            const serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
                privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                clientId: process.env.FIREBASE_CLIENT_ID,
                clientX509CertUrl: process.env.FIREBASE_CLIENT_CERT_URL,
            } as admin.ServiceAccount;

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });

            logger.info(`Firebase Admin SDK initialized with project: ${serviceAccount.projectId}`);
        } else {
            logger.info("Firebase Admin SDK already initialized");
        }

        return admin;
    } catch (error) {
        logger.error({ err: error }, "Firebase initialization error");
        throw error;
    }
}

// テストユーザーの作成・取得
export async function setupTestUser() {
    try {
        const adminInstance = await initializeFirebase();
        const auth = adminInstance.auth();

        const testEmail = "test@example.com";
        const testPassword = "password";
        const displayName = "Test User";

        // ユーザーが既に存在するか確認
        try {
            const userRecord = await auth.getUserByEmail(testEmail);
            logger.info(`Test user already exists: ${userRecord.uid}`);
            return userRecord;
        } catch (error: any) {
            if (error.code !== "auth/user-not-found") {
                throw error;
            }

            // ユーザーが存在しない場合は新規作成
            const userRecord = await auth.createUser({
                email: testEmail,
                password: testPassword,
                displayName: displayName,
                emailVerified: true,
            });

            logger.info(`Successfully created test user: ${userRecord.uid}`);

            // カスタムクレームを追加して開発環境用トークンの検証をバイパス
            await auth.setCustomUserClaims(userRecord.uid, {
                devUser: true,
                role: "admin",
            });

            logger.info(`Added custom claims to user: ${userRecord.uid}`);

            return userRecord;
        }
    } catch (error) {
        logger.error({ err: error }, "Error setting up test user");
        throw error;
    }
}

// スクリプトが直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
    setupTestUser()
        .then(user => {
            console.log("=================================================");
            console.log("開発環境用テストユーザーのセットアップが完了しました");
            console.log("=================================================");
            console.log("Email:", user.email);
            console.log("UID:", user.uid);
            console.log("DisplayName:", user.displayName);
            console.log("Password: password");
            console.log("=================================================");
            console.log("このユーザー情報を使ってアプリにログインしてください。");
            process.exit(0);
        })
        .catch(error => {
            console.error("テストユーザーのセットアップに失敗しました:", error);
            process.exit(1);
        });
}
