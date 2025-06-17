require("@dotenvx/dotenvx").config();
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
// ロガーモジュールをインポート
const {
    serverLogger: logger,
    clientLogger,
    telemetryLogger,
    telemetryLogPath,
    rotateClientLogs,
    rotateTelemetryLogs,
    rotateServerLogs,
    refreshClientLogStream,
    refreshTelemetryLogStream,
    refreshServerLogStream,
} = require("./utils/logger");

const bodyParser = require("body-parser");

// 開発環境のテストユーザー認証ヘルパーを読み込み
const isDevelopment = process.env.NODE_ENV !== "production";
let devAuthHelper;
if (isDevelopment) {
    try {
        devAuthHelper = require("./scripts/setup-dev-auth");
        logger.info("Development auth helper loaded");
    }
    catch (error) {
        logger.warn(`Development auth helper not available: ${error.message}`);
    }
}

// Set up periodic log rotation (every 24 hours)
const LOG_ROTATION_INTERVAL = process.env.LOG_ROTATION_INTERVAL || 24 * 60 * 60 * 1000; // Default: 24 hours
const periodicLogRotation = async () => {
    try {
        logger.info("Performing scheduled periodic log rotation");
        const clientRotated = await rotateClientLogs(2);
        const telemetryRotated = await rotateTelemetryLogs(2);
        const serverRotated = await rotateServerLogs(2);

        if (clientRotated) {
            refreshClientLogStream();
        }

        if (telemetryRotated) {
            refreshTelemetryLogStream();
        }

        if (serverRotated) {
            refreshServerLogStream();
        }

        logger.info(`Periodic log rotation completed: ${
            JSON.stringify({
                clientRotated,
                telemetryRotated,
                serverRotated,
                timestamp: new Date().toISOString(),
            })
        }`);
    }
    catch (error) {
        logger.error(`Error during periodic log rotation: ${error.message}`);
    }
};

// Start the periodic log rotation
const logRotationTimer = setInterval(periodicLogRotation, LOG_ROTATION_INTERVAL);

// Firebase認証情報を環境変数から構築
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

// Emulator環境では秘密鍵のチェックをスキップ
const isEmulatorEnvironment = process.env.USE_FIREBASE_EMULATOR === "true" ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_EMULATOR_HOST;

if (!serviceAccount.project_id || (!serviceAccount.private_key && !isEmulatorEnvironment)) {
    logger.error("Firebase service account environment variables are not properly configured.");
    process.exit(1);
}

// 注意: Azure Fluid Relay設定はFirebase Functionsに移行しました

// Firebase emulatorの起動を待つ関数
async function waitForFirebaseEmulator(maxRetries = 30, initialDelay = 1000, maxDelay = 10000) {
    const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST ||
        process.env.FIREBASE_EMULATOR_HOST;

    if (!isEmulator) {
        logger.info("Firebase emulator not configured, skipping connection wait");
        return;
    }

    logger.info(`Firebase emulator detected, waiting for connection... (max retries: ${maxRetries})`);

    let retryCount = 0;
    let delay = initialDelay;

    while (retryCount < maxRetries) {
        try {
            logger.info(`Firebase connection attempt ${retryCount + 1}/${maxRetries}...`);

            // Firebase Auth emulatorへの接続テスト
            const listUsersResult = await admin.auth().listUsers(1);

            logger.info(`Firebase emulator connection successful. Found users: ${listUsersResult.users.length}`);
            if (listUsersResult.users.length > 0) {
                logger.info(`First user: ${
                    JSON.stringify({
                        uid: listUsersResult.users[0].uid,
                        email: listUsersResult.users[0].email,
                        displayName: listUsersResult.users[0].displayName,
                    })
                }`);
            }

            return; // 成功した場合は関数を終了
        }
        catch (error) {
            retryCount++;

            if (error.code === "ECONNREFUSED" || error.message.includes("ECONNREFUSED")) {
                logger.warn(`Firebase emulator not ready yet (attempt ${retryCount}/${maxRetries}): ${error.message}`);

                if (retryCount < maxRetries) {
                    logger.info(`Waiting ${delay}ms before next retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));

                    // 指数バックオフ（最大遅延時間まで）
                    delay = Math.min(delay * 1.5, maxDelay);
                }
            }
            else {
                // ECONNREFUSED以外のエラーは即座に失敗とする
                logger.error(`Firebase emulator connection failed with non-connection error: ${error.message}`);
                throw error;
            }
        }
    }

    throw new Error(`Firebase emulator connection failed after ${maxRetries} attempts`);
}

// Firebase初期化を非同期関数でラップ
async function initializeFirebase() {
    try {
        // すでに初期化されている場合は一度削除
        try {
            const apps = admin.apps;
            if (apps.length) {
                logger.info("Firebase Admin SDK instance already exists, deleting...");
                admin.app().delete().then(() => {
                    logger.info("Previous Firebase Admin SDK instance deleted");
                });
            }
        }
        catch (deleteError) {
            logger.warn(`Previous Firebase Admin SDK instance deletion failed: ${deleteError.message}`);
        }

        // Firebase Emulator環境変数のチェックと警告
        const emulatorVariables = {
            FIREBASE_EMULATOR_HOST: process.env.FIREBASE_EMULATOR_HOST,
            FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
            FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
        };

        const configuredEmulators = Object.entries(emulatorVariables)
            .filter(([_, value]) => value)
            .map(([name, value]) => `${name}=${value}`);

        if (configuredEmulators.length > 0) {
            logger.warn(`⚠️ Firebase Emulator環境変数が設定されています。本番環境では問題になる可能性があります！`);
            logger.warn(`設定されているEmulator環境変数: ${configuredEmulators.join(", ")}`);
            logger.warn(`これらの環境変数は本来 .env.test に設定すべきもので、本番環境では設定しないでください。`);
        }

        // 新しいインスタンスを初期化
        // Emulator環境では認証情報なしで初期化
        if (
            isEmulatorEnvironment &&
            (!serviceAccount.private_key || serviceAccount.private_key.includes("Your Private Key Here"))
        ) {
            admin.initializeApp({
                projectId: serviceAccount.project_id,
            });
        }
        else {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        }
        logger.info(`Firebase Admin SDK initialized successfully. Project ID: ${serviceAccount.project_id}`);

        // Firebase接続テスト - エミュレータの起動を待つ
        if (isDevelopment) {
            try {
                await waitForFirebaseEmulator();
                logger.info("Firebase emulator connection established successfully");
            }
            catch (error) {
                logger.error(`Firebase emulator connection failed after retries: ${error.message}`);
            }
        }

        // FIREBASE_AUTH_EMULATOR_HOST 環境変数をチェック
        if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
            logger.warn(`Firebase Auth Emulator is configured: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
        }

        // 開発環境の場合は、テストユーザーをセットアップ（emulator起動待機後）
        if (isDevelopment && devAuthHelper) {
            try {
                const user = await devAuthHelper.setupTestUser();
                logger.info(`開発環境用テストユーザーをセットアップしました: ${user.email} (${user.uid})`);

                // テストユーザーのセットアップ後、Firestoreエミュレータのデータをクリア
                const isEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HOST;
                if (isEmulator) {
                    try {
                        const cleared = await clearFirestoreEmulatorData();
                        if (cleared) {
                            logger.info("開発環境の Firestore エミュレータデータを消去しました");
                        }
                    }
                    catch (error) {
                        logger.error(`Firestore エミュレータデータの消去に失敗しました: ${error.message}`);
                    }
                }
            }
            catch (error) {
                logger.warn(`テストユーザーのセットアップに失敗しました: ${error.message}`);
            }
        }
    }
    catch (error) {
        logger.error(`Firebase初期化エラー: ${error.message}`);
        process.exit(1);
    }
}

// Firebase初期化を実行
initializeFirebase();

const app = express();
// CORS設定を強化
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(origin => origin.trim())
        : ["http://localhost:7070"], // カンマ区切りで複数オリジンをサポート
    methods: ["GET", "POST", "OPTIONS"], // OPTIONSメソッドを追加(プリフライトリクエスト対応)
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"], // 許可するヘッダーを明示
}));
app.use(express.json());
app.use(bodyParser.json());

// プリフライトリクエスト用のルート
app.options("*", cors());

// ヘルスチェックエンドポイント
app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// データベース接続設定 - 例としてFirestoreを使用
const db = admin.firestore();
const userContainersCollection = db.collection("userContainers");
const containerUsersCollection = db.collection("containerUsers");

// Firestore エミュレータのデータを全て消去する関数
async function clearFirestoreEmulatorData() {
    // エミュレータ環境でのみ実行
    const isEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HOST;
    if (!isEmulator) {
        logger.warn("Firestore エミュレータが検出されなかったため、データ消去をスキップします");
        return false;
    }

    try {
        logger.info("Firestore エミュレータのデータを消去しています...");

        // ルートコレクションを取得
        const collections = await db.listCollections();

        // 各コレクションのドキュメントを削除
        for (const collection of collections) {
            const collectionName = collection.id;
            logger.info(`コレクション '${collectionName}' のドキュメントを削除しています...`);

            const batchSize = 500;
            const query = db.collection(collectionName).limit(batchSize);

            await deleteQueryBatch(query);

            logger.info(`コレクション '${collectionName}' のドキュメントを削除しました`);
        }

        logger.info("Firestore エミュレータのデータを全て消去しました");
        return true;
    }
    catch (error) {
        logger.error(`Firestore エミュレータのデータ消去中にエラーが発生しました: ${error.message}`);
        return false;
    }
}

// バッチ処理でドキュメントを削除する関数
async function deleteQueryBatch(query) {
    const snapshot = await query.get();

    // ドキュメントが存在しない場合は終了
    if (snapshot.size === 0) {
        return;
    }

    // バッチ処理でドキュメントを削除
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    // 再帰的に残りのドキュメントを削除
    if (snapshot.size > 0) {
        await deleteQueryBatch(query);
    }
}

// 注: テストユーザーのセットアップ後にデータクリアを行うため、ここでの実行は不要

// 注意: /api/save-container エンドポイントはFirebase Functionsに移行しました
// 注意: /api/get-user-containers エンドポイントはFirebase Functionsに移行しました

// コンテナにアクセス可能なユーザーのリストを取得するエンドポイント（管理者用）
app.post("/api/get-container-users", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        // Firebaseトークンを検証
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // TODO: 管理者権限チェックを追加する場合はここに実装

        const containerDoc = await containerUsersCollection.doc(containerId).get();

        if (!containerDoc.exists) {
            return res.status(404).json({ error: "Container not found" });
        }

        const containerData = containerDoc.data();

        res.status(200).json({
            users: containerData.accessibleUserIds || [],
        });
    }
    catch (error) {
        logger.error(`Error getting container users: ${error.message}`);
        res.status(500).json({ error: "Failed to get container users" });
    }
});

// Email/Password認証エンドポイント
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // Firebase認証は実際にはクライアント側で行われるため、
        // このエンドポイントは開発環境でのデバッグ用途に限定する
        if (isDevelopment) {
            try {
                // テストユーザーかどうかを確認
                const userRecord = await admin.auth().getUserByEmail(email);

                if (email === "test@example.com" && password === "password123") {
                    // 開発環境用のカスタムトークンを生成
                    const customToken = await admin.auth().createCustomToken(userRecord.uid, {
                        devUser: true,
                        role: "admin",
                    });

                    return res.status(200).json({
                        customToken,
                        user: {
                            uid: userRecord.uid,
                            email: userRecord.email,
                            displayName: userRecord.displayName,
                        },
                    });
                }
            }
            catch (error) {
                logger.error(`Development login error: ${error.message}`);
            }
        }

        // 本番環境では常にエラーを返す（実際の認証はFirebase SDKでクライアント側で行われる）
        return res.status(401).json({ error: "Invalid credentials" });
    }
    catch (error) {
        logger.error(`Login error: ${error.message}`);
        res.status(500).json({ error: "Authentication failed" });
    }
});

// 注意: /api/fluid-token エンドポイントはFirebase Functionsに移行しました

// クライアントからのログを受信するエンドポイント
app.post("/api/log", (req, res) => {
    try {
        const logData = req.body;

        // ログデータのバリデーション
        if (!logData || !logData.level || !logData.log) {
            logger.warn(`無効なログ形式を受信しました: ${JSON.stringify({ receivedData: logData })}`);
            return res.status(400).json({ error: "無効なログ形式" });
        }

        // クライアント情報を追加
        const enrichedLog = {
            ...logData,
            clientIp: req.ip || "unknown",
            timestamp: logData.timestamp || new Date().toISOString(),
            source: "client",
        };

        // telemetryログかどうかを判定
        const isTelemetryLog = logData.isTelemetry === true;

        // 適切なロガーを選択
        const targetLogger = isTelemetryLog ? telemetryLogger : clientLogger;

        // レベルに応じたログ出力
        switch (logData.level.toLowerCase()) {
            case "trace":
                targetLogger.trace(JSON.stringify(enrichedLog));
                break;
            case "debug":
                targetLogger.debug(JSON.stringify(enrichedLog));
                break;
            case "info":
                targetLogger.info(JSON.stringify(enrichedLog));
                break;
            case "warn":
                targetLogger.warn(JSON.stringify(enrichedLog));
                break;
            case "error":
                targetLogger.error(JSON.stringify(enrichedLog));
                break;
            case "fatal":
                targetLogger.fatal(JSON.stringify(enrichedLog));
                break;
            default:
                targetLogger.info(JSON.stringify(enrichedLog)); // デフォルトはinfoレベル
        }

        res.status(200).json({ success: true });
    }
    catch (error) {
        logger.error(`ログ処理エラー: ${error.message}`);
        res.status(500).json({ error: "ログ処理に失敗しました" });
    }
});

// telemetryログファイルの内容を取得するエンドポイント（開発環境のみ）
if (isDevelopment) {
    app.get("/api/telemetry-logs", (req, res) => {
        try {
            // telemetryログファイルが存在するか確認
            if (!fs.existsSync(telemetryLogPath)) {
                return res.status(404).json({ error: "Telemetryログファイルが見つかりません" });
            }

            // ファイルサイズを取得
            const stats = fs.statSync(telemetryLogPath);
            const fileSizeInBytes = stats.size;

            // 大きすぎる場合は最後の部分だけ読み込む
            const MAX_SIZE = 1024 * 1024; // 1MB
            let position = Math.max(0, fileSizeInBytes - MAX_SIZE);
            let length = fileSizeInBytes - position;

            // ファイルを読み込む
            fs.open(telemetryLogPath, "r", (err, fd) => {
                if (err) {
                    logger.error(`Telemetryログファイルを開けませんでした: ${err.message}`);
                    return res.status(500).json({ error: "ファイルを開けませんでした" });
                }

                const buffer = Buffer.alloc(length);
                fs.read(fd, buffer, 0, length, position, (err, bytesRead, buffer) => {
                    fs.close(fd, () => {});

                    if (err) {
                        logger.error(`Telemetryログファイルの読み込みに失敗しました: ${err.message}`);
                        return res.status(500).json({ error: "ファイルの読み込みに失敗しました" });
                    }

                    // バッファをテキストに変換
                    const data = buffer.toString("utf8");

                    // 各行をJSONオブジェクトに変換
                    const lines = data.split("\n").filter(line => line.trim());
                    const logs = lines.map(line => {
                        try {
                            return JSON.parse(line);
                        }
                        catch (e) {
                            return { raw: line };
                        }
                    });

                    res.status(200).json({
                        logs,
                        totalSize: fileSizeInBytes,
                        readSize: bytesRead,
                        truncated: position > 0,
                    });
                });
            });
        }
        catch (error) {
            logger.error(`Telemetryログ取得エラー: ${error.message}`);
            res.status(500).json({ error: "Telemetryログの取得に失敗しました" });
        }
    });
}

// ログファイルをローテーションするエンドポイント
app.post("/api/rotate-logs", async (req, res) => {
    try {
        // クライアント・telemetry・サーバーのログファイルをローテーション
        const clientRotated = await rotateClientLogs(2);
        const telemetryRotated = await rotateTelemetryLogs(2);
        const serverRotated = await rotateServerLogs(2);

        // 新しいログストリームを作成（既存のストリームを閉じて再作成）
        if (clientRotated) {
            refreshClientLogStream();
        }

        if (telemetryRotated) {
            refreshTelemetryLogStream();
        }

        if (serverRotated) {
            refreshServerLogStream();
        }

        res.status(200).json({
            success: true,
            clientRotated,
            telemetryRotated,
            serverRotated,
            timestamp: new Date().toISOString(),
        });

        // 新しいログファイルに情報を記録
        logger.info(`ログファイルをローテーションしました: ${
            JSON.stringify({
                clientRotated,
                telemetryRotated,
                serverRotated,
                timestamp: new Date().toISOString(),
            })
        }`);
    }
    catch (error) {
        logger.error(`ログローテーション中にエラーが発生しました: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// デバッグ用: トークン内容を検証（開発環境のみ）
if (process.env.NODE_ENV !== "production") {
    app.get("/debug/token-info", async (req, res) => {
        try {
            const { token } = req.query;

            if (!token) {
                return res.status(400).json({ error: "トークンが必要です" });
            }

            // JWTをデコード（検証なし）
            const decoded = jwt.decode(token, { complete: true });

            if (!decoded) {
                return res.status(400).json({ error: "無効なJWTトークンです" });
            }

            return res.json({
                header: decoded.header,
                payload: decoded.payload,
                // 署名は表示しない
                expiresIn: decoded.payload.exp ? new Date(decoded.payload.exp * 1000).toISOString() : "N/A",
                issuedAt: decoded.payload.iat ? new Date(decoded.payload.iat * 1000).toISOString() : "N/A",
            });
        }
        catch (error) {
            res.status(500).json({ error: `トークン情報の取得に失敗しました: ${error.message}` });
        }
    });
}

// テストユーザー作成エンドポイント
app.post("/api/create-test-user", async (req, res) => {
    // 本番環境では無効化
    if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ error: "Not available in production" });
    }

    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const auth = admin.auth();

        // ユーザーが既に存在するか確認
        try {
            const existingUser = await auth.getUserByEmail(email);
            return res.status(200).json({
                message: "User already exists",
                uid: existingUser.uid,
            });
        }
        catch (error) {
            if (error.code !== "auth/user-not-found") {
                throw error;
            }
        }

        const userRecord = await auth.createUser({
            email,
            password,
            displayName,
            emailVerified: true,
        });

        // 開発環境用のカスタムクレームを設定
        await auth.setCustomUserClaims(userRecord.uid, {
            devUser: true,
            role: "user",
        });

        logger.info(`Successfully created test user: ${userRecord.uid}`);
        res.status(200).json({
            message: "User created successfully",
            uid: userRecord.uid,
        });
    }
    catch (error) {
        logger.error(`Error creating test user: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// 注意: generateAzureFluidToken 関数はFirebase Functionsに移行しました

const PORT = process.env.PORT || 7071;
app.listen(PORT, () => {
    logger.info(`Auth service running on port ${PORT}`);
    logger.info(`CORS origin: ${process.env.CORS_ORIGIN || "*"}`);
});
