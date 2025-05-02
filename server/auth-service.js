require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const fsExtra = require("fs-extra");
const { generateToken } = require("@fluidframework/azure-service-utils");
const { ScopeType, IUser } = require("@fluidframework/azure-client");
// ロガーモジュールをインポート
const {
    serverLogger: logger,
    clientLogger,
    telemetryLogger,
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

// サービスアカウントJSONファイルのパス
const serviceAccountPath = path.join(__dirname, "firebase-adminsdk.json");

// 環境変数のチェック
const requiredEnvVars = [
    "AZURE_TENANT_ID",
    "AZURE_FLUID_RELAY_ENDPOINT",
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    logger.error(`必須環境変数が設定されていません: ${missingVars.join(", ")}`);
    logger.error("サーバーを起動する前に.envファイルを確認してください。");
    process.exit(1);
}

// Firebase認証情報JSONファイルの存在確認
if (!fs.existsSync(serviceAccountPath)) {
    logger.error(`Firebase認証情報ファイルが見つかりません: ${serviceAccountPath}`);
    logger.error("Firebase Admin SDKからダウンロードしたJSONファイルを上記のパスに配置してください。");
    process.exit(1);
}

// JSONファイルからFirebase認証情報を読み込む
let serviceAccount;
try {
    serviceAccount = require("./firebase-adminsdk.json");
    logger.info(`Firebase認証情報を読み込みました。プロジェクトID: ${serviceAccount.project_id}`);
}
catch (error) {
    logger.error(`Firebase認証情報ファイルの読み込みに失敗しました: ${error.message}`);
    process.exit(1);
}

// Azure Fluid Relay設定
const azureConfig = {
    tenantId: process.env.AZURE_TENANT_ID,
    endpoint: process.env.AZURE_FLUID_RELAY_ENDPOINT,
    primaryKey: process.env.AZURE_PRIMARY_KEY,
    secondaryKey: process.env.AZURE_SECONDARY_KEY,
    // キーローテーション中はこれをsecondaryに設定
    activeKey: process.env.AZURE_ACTIVE_KEY || "primary",
};

// Firebase初期化
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
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
    logger.info(`Firebase Admin SDK initialized successfully. Project ID: ${serviceAccount.project_id}`);

    // Firebase接続テスト - ユーザー一覧を取得して確認
    if (isDevelopment) {
        logger.info("Testing Firebase Admin SDK connection...");
        admin.auth().listUsers(100)
            .then(listUsersResult => {
                logger.info(`Firebase connection test successful. Found users: ${listUsersResult.users.length}`);
                if (listUsersResult.users.length > 0) {
                    logger.info(`First user: ${
                        JSON.stringify({
                            uid: listUsersResult.users[0].uid,
                            email: listUsersResult.users[0].email,
                            displayName: listUsersResult.users[0].displayName,
                        })
                    }`);
                }
            })
            .catch(listError => {
                logger.error(`Firebase connection test failed: ${listError.message}`);
            });
    }

    // FIREBASE_AUTH_EMULATOR_HOST 環境変数をチェック
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        logger.warn(`Firebase Auth Emulator is configured: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
    }

    // 開発環境の場合は、テストユーザーをセットアップ
    if (isDevelopment && devAuthHelper) {
        devAuthHelper.setupTestUser()
            .then(user => {
                logger.info(`開発環境用テストユーザーをセットアップしました: ${user.email} (${user.uid})`);
            })
            .catch(error => {
                logger.warn(`テストユーザーのセットアップに失敗しました: ${error.message}`);
            });
    }
}
catch (error) {
    logger.error(`Firebase初期化エラー: ${error.message}`);
    process.exit(1);
}

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

// ユーザーのコンテナIDを保存するエンドポイント
app.post("/api/save-container", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        // Firebaseトークンを検証
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        try {
            // Firestoreトランザクションを使用して両方のコレクションを更新
            await db.runTransaction(async transaction => {
                const userDocRef = userContainersCollection.doc(userId);
                const containerDocRef = containerUsersCollection.doc(containerId);

                // すべての読み取り操作を先に実行
                const userDoc = await transaction.get(userDocRef);
                const containerDoc = await transaction.get(containerDocRef);

                // 読み取り完了後に書き込み操作を開始
                // ユーザーのデフォルトコンテナIDとアクセス可能なコンテナIDを更新
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const accessibleContainerIds = userData.accessibleContainerIds || [];

                    if (!accessibleContainerIds.includes(containerId)) {
                        accessibleContainerIds.push(containerId);
                    }

                    transaction.update(userDocRef, {
                        defaultContainerId: containerId,
                        accessibleContainerIds,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                else {
                    transaction.set(userDocRef, {
                        userId,
                        defaultContainerId: containerId,
                        accessibleContainerIds: [containerId],
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }

                // コンテナのアクセス可能なユーザーIDを更新
                if (containerDoc.exists) {
                    const containerData = containerDoc.data();
                    const accessibleUserIds = containerData.accessibleUserIds || [];

                    if (!accessibleUserIds.includes(userId)) {
                        accessibleUserIds.push(userId);
                    }

                    transaction.update(containerDocRef, {
                        accessibleUserIds,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                else {
                    transaction.set(containerDocRef, {
                        containerId,
                        accessibleUserIds: [userId],
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            });

            logger.info(`Saved container ID ${containerId} for user ${userId}`);
            res.status(200).json({ success: true });
        }
        catch (firestoreError) {
            logger.error(`Firestore error while saving container ID: ${firestoreError.message}`);
            res.status(500).json({ error: "Database error while saving container ID" });
        }
    }
    catch (error) {
        logger.error(`Error saving container ID: ${error.message}`);
        res.status(500).json({ error: "Failed to save container ID" });
    }
});

// ユーザーがアクセス可能なコンテナIDのリストを取得するエンドポイント
app.post("/api/get-user-containers", async (req, res) => {
    try {
        const { idToken } = req.body;

        // Firebaseトークンを検証
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        const userDoc = await userContainersCollection.doc(userId).get();

        if (!userDoc.exists) {
            return res.status(200).json({ containers: [], defaultContainerId: null });
        }

        const userData = userDoc.data();

        res.status(200).json({
            containers: userData.accessibleContainerIds || [],
            defaultContainerId: userData.defaultContainerId || null,
        });
    }
    catch (error) {
        logger.error(`Error getting user containers: ${error.message}`);
        res.status(500).json({ error: "Failed to get user containers" });
    }
});

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

// Firebase認証トークン検証とFluid Relay JWT生成を一括処理
app.post("/api/fluid-token", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        // Firebase IDトークンを検証
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // ユーザーのコンテナ情報を取得
        const userDoc = await userContainersCollection.doc(userId).get();

        // ユーザーデータが存在しない場合のデフォルト値を設定
        const userData = userDoc.exists ? userDoc.data() : { accessibleContainerIds: [] };
        const accessibleContainerIds = userData.accessibleContainerIds || [];
        const defaultContainerId = userData.defaultContainerId || null;

        // 使用するコンテナIDを決定
        let targetContainerId = containerId;

        // コンテナIDが指定されていない場合はデフォルトを使用
        if (!targetContainerId && defaultContainerId) {
            logger.info(`No container ID specified, using default container: ${defaultContainerId}`);
            targetContainerId = defaultContainerId;
        }

        // コンテナIDが指定されている場合はアクセス権をチェック
        if (targetContainerId) {
            if (!accessibleContainerIds.includes(targetContainerId)) {
                return res.status(403).json({ error: "Access to the container is denied" });
            }
        }

        // Azure Fluid RelayのJWT生成
        const jwt = generateAzureFluidToken({
            uid: userId,
            displayName: decodedToken.name || decodedToken.displayName || "Anonymous User",
        }, targetContainerId);

        // レスポンスを返す
        res.status(200).json({
            token: jwt.token,
            user: {
                id: userId,
                name: decodedToken.name || decodedToken.displayName || "Anonymous User",
            },
            tenantId: azureConfig.tenantId,
            containerId: targetContainerId,
            defaultContainerId,
            accessibleContainerIds,
        });
    }
    catch (error) {
        logger.error(`Token validation error: ${error.message}`);
        res.status(401).json({ error: "Authentication failed" });
    }
});

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
                        } catch (e) {
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

// Azure Fluid Relay用トークン生成関数
function generateAzureFluidToken(user, containerId = undefined) {
    // 使用するキーを決定
    const keyToUse = azureConfig.activeKey === "secondary" && azureConfig.secondaryKey
        ? azureConfig.secondaryKey
        : azureConfig.primaryKey;

    if (!keyToUse) {
        logger.warn("Azure Keyが設定されていません。テスト用トークンを生成します。");
        return {
            token: `test-token-${user.uid}-${Date.now()}`,
            user: { id: user.uid, name: user.displayName },
        };
    }

    try {
        // トークン生成前にテナントIDをログに出力して確認
        logger.info(`Generating token with tenantId: ${azureConfig.tenantId}`);

        // コンテナID情報をログに出力
        if (containerId) {
            logger.info(`Token will be scoped to container: ${containerId}`);
        }

        // 公式Fluid Service Utilsを使用してトークンを生成
        const fluidUser = {
            id: user.uid,
            name: user.displayName || "Anonymous",
        };

        const token = generateToken(
            azureConfig.tenantId, // テナントID
            keyToUse, // 署名キー
            [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite], // 権限スコープ
            containerId, // コンテナID (指定されていれば)
            fluidUser,
        );

        // 使用したキーとテナントIDをログに記録（デバッグ用）
        logger.info(
            `Generated token for user: ${user.uid} using ${azureConfig.activeKey} key and tenantId: ${azureConfig.tenantId}`,
        );

        // JWT内容をデコードして確認（デバッグ用）
        const decoded = jwt.decode(token);
        logger.info(`Token payload: ${JSON.stringify(decoded)}`);

        return {
            token,
            user: {
                id: user.uid,
                name: user.displayName || "Anonymous",
            },
            tenantId: azureConfig.tenantId, // クライアントに明示的にテナントIDを返す
            containerId: containerId || null, // 対象コンテナIDも返す
        };
    }
    catch (error) {
        logger.error(`Fluid token generation error: ${error.message}`);
        throw new Error("トークン生成に失敗しました");
    }
}

const PORT = process.env.PORT || 7071;
app.listen(PORT, () => {
    logger.info(`Auth service running on port ${PORT}`);
    logger.info(`CORS origin: ${process.env.CORS_ORIGIN || "*"}`);
});
