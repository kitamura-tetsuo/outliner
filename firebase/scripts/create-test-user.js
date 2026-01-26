// Firebase Auth Emulator Test User Setup
const admin = require("firebase-admin");
const http = require("http");

// Check if Firebase Auth emulator is running locally
const checkEmulatorRunning = (port = 59099) => {
    return new Promise(resolve => {
        const req = http.request({
            method: "GET",
            host: "localhost",
            port,
            path: "/",
            timeout: 3000,
        }, res => {
            // Response received, emulator is running
            resolve(true);
        });

        req.on("error", () => {
            // Error connecting, emulator is not running
            resolve(false);
        });

        req.on("timeout", () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
};

// Create a test user in Firebase Auth emulator
const createTestUser = async () => {
    try {
        // コンテナ内では localhost:59099 を使用
        const emulatorHost = "localhost";
        const emulatorPort = 59099;

        console.log(`Checking emulator at ${emulatorHost}:${emulatorPort}...`);

        const isRunning = await checkEmulatorRunning(emulatorPort);
        if (!isRunning) {
            console.error("Firebase Auth emulator is not running locally");
            throw new Error("Firebase Auth emulator not running");
        }

        console.log(`Firebase Auth emulator is running at ${emulatorHost}:${emulatorPort}`);

        // Firebase Admin の初期化
        if (admin.apps.length === 0) {
            admin.initializeApp({
                projectId: "demo-project",
            });
        }

        // Auth エミュレータを指定
        process.env.FIREBASE_AUTH_EMULATOR_HOST = `${emulatorHost}:${emulatorPort}`;
        console.log(`Setting Auth emulator host to: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);

        const testEmail = "test@example.com";
        const testPassword = "password";

        // ユーザーが既に存在するか確認
        try {
            const userRecord = await admin.auth().getUserByEmail(testEmail);
            console.log(`Test user already exists: ${userRecord.uid}`);
            return userRecord;
        } catch (error) {
            // ユーザーが存在しない場合は作成を続行
            if (error.code !== "auth/user-not-found") {
                throw error;
            }
        }

        // テストユーザーを作成
        const userRecord = await admin.auth().createUser({
            email: testEmail,
            password: testPassword,
            displayName: "Test User",
            emailVerified: true,
        });

        console.log(`Successfully created test user: ${userRecord.uid}`);
        return userRecord;
    } catch (error) {
        console.error("Error creating test user:", error);
        throw error;
    }
};

// スクリプトが直接実行された場合
if (require.main === module) {
    createTestUser()
        .then(() => {
            console.log("Test user setup completed");
            process.exit(0);
        })
        .catch(error => {
            console.error("Test user setup failed:", error);
            process.exit(1);
        });
}

module.exports = { createTestUser };
