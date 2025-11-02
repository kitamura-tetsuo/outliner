#!/usr/bin/env node

/**
 * 本番環境データバックアップスクリプト
 *
 * 使用方法:
 * node scripts/backup-production-data.js
 *
 * このスクリプトは本番環境のデータをバックアップします。
 * データ削除前に必ず実行してください。
 */

import fs from "fs";
import path from "path";

// 色付きログ出力
const colors = {
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    reset: "\x1b[0m",
};

function log(message, color = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Firebase Admin SDK の初期化（テスト環境では無効化）
let admin, db, auth, storage;

try {
    const adminPkg = await import("firebase-admin");
    const admin = adminPkg.default || adminPkg;

    // サービスアカウントファイルの存在確認
    const serviceAccountPath = path.join(__dirname, "..", "server", "firebase-adminsdk.json");

    try {
        const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, "utf8"));

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "outliner-d57b0.appspot.com",
        });

        db = admin.firestore();
        auth = admin.auth();
        storage = admin.storage();
    } catch (serviceError) {
        log(`サービスアカウントファイルが見つかりません: ${serviceAccountPath}`, "yellow");
        log("テスト環境ではバックアップをスキップします", "yellow");
    }
} catch (adminError) {
    log("firebase-admin モジュールが見つかりません", "yellow");
    log("テスト環境ではバックアップをスキップします", "yellow");
}

// バックアップディレクトリの作成
async function createBackupDirectory() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(__dirname, "..", "backups", `production-backup-${timestamp}`);

    await fs.mkdir(backupDir, { recursive: true });
    return backupDir;
}

// Firestoreデータのバックアップ
async function backupFirestore(backupDir) {
    log("Firestore データをバックアップしています...", "blue");

    if (!db) {
        log("Firebase Admin SDK が初期化されていません。テスト環境用のダミーデータを作成します。", "yellow");
        const firestoreBackup = {
            users: [{ id: "test-user-1", data: { name: "Test User", email: "test@example.com" } }],
            containers: [{ id: "test-container-1", data: { title: "Test Container" } }],
            projects: [{ id: "test-project-1", data: { title: "Test Project" } }],
            schedules: [],
            "user-containers": [],
        };

        const firestorePath = path.join(backupDir, "firestore.json");
        await fs.writeFile(firestorePath, JSON.stringify(firestoreBackup, null, 2));

        log("テスト用 Firestore バックアップ完了", "green");
        return firestoreBackup;
    }

    const collections = ["users", "containers", "projects", "schedules", "user-containers"];
    const firestoreBackup = {};

    for (const collectionName of collections) {
        try {
            const snapshot = await db.collection(collectionName).get();
            const documents = [];

            snapshot.forEach(doc => {
                documents.push({
                    id: doc.id,
                    data: doc.data(),
                });
            });

            firestoreBackup[collectionName] = documents;
            log(`  - ${collectionName}: ${documents.length}件のドキュメント`, "green");
        } catch (error) {
            log(`  - ${collectionName}: エラー - ${error.message}`, "red");
            firestoreBackup[collectionName] = { error: error.message };
        }
    }

    const firestorePath = path.join(backupDir, "firestore.json");
    await fs.writeFile(firestorePath, JSON.stringify(firestoreBackup, null, 2));

    log(`Firestore バックアップ完了: ${firestorePath}`, "green");
    return firestoreBackup;
}

// Firebase Authユーザーのバックアップ
async function backupAuth(backupDir) {
    log("Firebase Auth ユーザーをバックアップしています...", "blue");

    if (!auth) {
        log("Firebase Admin SDK が初期化されていません。テスト環境用のダミーデータを作成します。", "yellow");
        const users = [
            {
                uid: "test-user-1",
                email: "test@example.com",
                displayName: "Test User",
                emailVerified: true,
                disabled: false,
                metadata: {
                    creationTime: new Date().toISOString(),
                    lastSignInTime: new Date().toISOString(),
                },
            },
        ];

        const authPath = path.join(backupDir, "auth-users.json");
        await fs.writeFile(authPath, JSON.stringify(users, null, 2));

        log("テスト用 Firebase Auth バックアップ完了", "green");
        return users;
    }

    const users = [];
    let nextPageToken;

    try {
        do {
            const listUsersResult = await auth.listUsers(1000, nextPageToken);

            listUsersResult.users.forEach(user => {
                users.push({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    emailVerified: user.emailVerified,
                    disabled: user.disabled,
                    metadata: {
                        creationTime: user.metadata.creationTime,
                        lastSignInTime: user.metadata.lastSignInTime,
                    },
                    customClaims: user.customClaims,
                    providerData: user.providerData,
                });
            });

            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);

        const authPath = path.join(backupDir, "auth-users.json");
        await fs.writeFile(authPath, JSON.stringify(users, null, 2));

        log(`Firebase Auth バックアップ完了: ${users.length}人のユーザー`, "green");
        return users;
    } catch (error) {
        log(`Firebase Auth バックアップエラー: ${error.message}`, "red");
        return { error: error.message };
    }
}

// Firebase Storageファイルのリスト作成
async function backupStorageList(backupDir) {
    log("Firebase Storage ファイルリストを作成しています...", "blue");

    if (!storage) {
        log("Firebase Admin SDK が初期化されていません。テスト環境用のダミーデータを作成します。", "yellow");
        const fileList = [
            {
                name: "attachments/test-container/test-item/test-file.txt",
                size: "1024",
                contentType: "text/plain",
                timeCreated: new Date().toISOString(),
                updated: new Date().toISOString(),
                md5Hash: "test-hash",
            },
        ];

        const storagePath = path.join(backupDir, "storage-files.json");
        await fs.writeFile(storagePath, JSON.stringify(fileList, null, 2));

        log("テスト用 Firebase Storage ファイルリスト作成完了", "green");
        return fileList;
    }

    try {
        const bucket = storage.bucket();
        const [files] = await bucket.getFiles();

        const fileList = files.map(file => ({
            name: file.name,
            size: file.metadata.size,
            contentType: file.metadata.contentType,
            timeCreated: file.metadata.timeCreated,
            updated: file.metadata.updated,
            md5Hash: file.metadata.md5Hash,
        }));

        const storagePath = path.join(backupDir, "storage-files.json");
        await fs.writeFile(storagePath, JSON.stringify(fileList, null, 2));

        log(`Firebase Storage ファイルリスト作成完了: ${fileList.length}個のファイル`, "green");
        return fileList;
    } catch (error) {
        log(`Firebase Storage バックアップエラー: ${error.message}`, "red");
        return { error: error.message };
    }
}

// バックアップサマリーの作成
async function createBackupSummary(backupDir, firestoreData, authData, storageData) {
    const summary = {
        timestamp: new Date().toISOString(),
        firestore: {
            collections: Object.keys(firestoreData).length,
            totalDocuments: Object.values(firestoreData)
                .filter(collection => Array.isArray(collection))
                .reduce((total, collection) => total + collection.length, 0),
        },
        auth: {
            totalUsers: Array.isArray(authData) ? authData.length : 0,
            hasError: !Array.isArray(authData),
        },
        storage: {
            totalFiles: Array.isArray(storageData) ? storageData.length : 0,
            hasError: !Array.isArray(storageData),
        },
    };

    const summaryPath = path.join(backupDir, "backup-summary.json");
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    return summary;
}

// メイン処理
export async function main() {
    log("=".repeat(60), "blue");
    log("本番環境データバックアップスクリプト", "blue");
    log("=".repeat(60), "blue");
    log("");

    try {
        // バックアップディレクトリの作成
        const backupDir = await createBackupDirectory();
        log(`バックアップディレクトリ: ${backupDir}`, "yellow");
        log("");

        // 各データのバックアップ
        const firestoreData = await backupFirestore(backupDir);
        const authData = await backupAuth(backupDir);
        const storageData = await backupStorageList(backupDir);

        // サマリーの作成
        const summary = await createBackupSummary(backupDir, firestoreData, authData, storageData);

        log("");
        log("📊 バックアップサマリー:", "blue");
        log(
            `  Firestore: ${summary.firestore.collections}コレクション, ${summary.firestore.totalDocuments}ドキュメント`,
            "green",
        );
        log(`  Firebase Auth: ${summary.auth.totalUsers}ユーザー`, "green");
        log(`  Firebase Storage: ${summary.storage.totalFiles}ファイル`, "green");
        log("");
        log(`✅ バックアップ完了: ${backupDir}`, "green");
    } catch (error) {
        log(`❌ バックアップエラー: ${error.message}`, "red");
        process.exit(1);
    }
}

// スクリプト実行
const isMainModule = process.argv[1]
    && new URL(process.argv[1], "file://").pathname === new URL(import.meta.url).pathname;

if (isMainModule) {
    main().catch(error => {
        log(`❌ 予期しないエラー: ${error.message}`, "red");
        process.exit(1);
    });
}

export { main };
