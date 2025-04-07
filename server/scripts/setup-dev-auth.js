// Development environment authentication setup script
require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { serverLogger: logger } = require('../utils/logger');

// サービスアカウントJSONファイルのパス
const serviceAccountPath = path.join(__dirname, '..', 'firebase-adminsdk.json');

// Firebase Admin SDKの初期化
async function initializeFirebase() {
    try {
        // Check if already initialized
        if (admin.apps.length === 0) {
            // JSONファイルからFirebase認証情報を読み込む
            const serviceAccount = require(serviceAccountPath);

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });

            logger.info(`Firebase Admin SDK initialized with project: ${serviceAccount.project_id}`);
        } else {
            logger.info('Firebase Admin SDK already initialized');
        }

        return admin;
    } catch (error) {
        logger.error('Firebase initialization error:', error);
        throw error;
    }
}

// テストユーザーの作成・取得
async function setupTestUser() {
    try {
        const adminInstance = await initializeFirebase();
        const auth = adminInstance.auth();

        const testEmail = 'test@example.com';
        const testPassword = 'password';
        const displayName = 'Test User';

        // ユーザーが既に存在するか確認
        try {
            const userRecord = await auth.getUserByEmail(testEmail);
            logger.info(`Test user already exists: ${userRecord.uid}`);
            return userRecord;
        } catch (error) {
            if (error.code !== 'auth/user-not-found') {
                throw error;
            }

            // ユーザーが存在しない場合は新規作成
            const userRecord = await auth.createUser({
                email: testEmail,
                password: testPassword,
                displayName: displayName,
                emailVerified: true
            });

            logger.info(`Successfully created test user: ${userRecord.uid}`);

            // カスタムクレームを追加して開発環境用トークンの検証をバイパス
            await auth.setCustomUserClaims(userRecord.uid, {
                devUser: true,
                role: 'admin'
            });

            logger.info(`Added custom claims to user: ${userRecord.uid}`);

            return userRecord;
        }
    } catch (error) {
        logger.error('Error setting up test user:', error);
        throw error;
    }
}

// スクリプトが直接実行された場合
if (require.main === module) {
    setupTestUser()
        .then(user => {
            console.log('=================================================');
            console.log('開発環境用テストユーザーのセットアップが完了しました');
            console.log('=================================================');
            console.log('Email:', user.email);
            console.log('UID:', user.uid);
            console.log('DisplayName:', user.displayName);
            console.log('Password: password');
            console.log('=================================================');
            console.log('このユーザー情報を使ってアプリにログインしてください。');
            process.exit(0);
        })
        .catch(error => {
            console.error('テストユーザーのセットアップに失敗しました:', error);
            process.exit(1);
        });
}

module.exports = { setupTestUser, initializeFirebase };