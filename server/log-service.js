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

// Firebase初期化を実行して完了を待つ
const { initializeFirebase } = require("./firebase-init");

// 開発環境判定
const isDevelopment = process.env.NODE_ENV !== "production";

// Firebase初期化完了後にサーバーを起動
async function startServer() {
    try {
        // Firebase初期化を待つ
        await initializeFirebase();
        logger.info("Firebase initialization completed, starting log service...");

        // サーバー起動処理を開始
        return startLogService();
    } catch (error) {
        logger.error(`Failed to initialize Firebase: ${error.message}`);
        throw error;
    }
}

function startLogService() {
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
        } catch (error) {
            logger.error(`Error during periodic log rotation: ${error.message}`);
        }
    };

    // Start the periodic log rotation
    const logRotationTimer = setInterval(periodicLogRotation, LOG_ROTATION_INTERVAL);

    const app = express();

    // CORS_ORIGINの値を検証して安全な値のみを使用
    function getSafeOrigins() {
        const defaultOrigins = ["http://localhost:7070"];

        if (!process.env.CORS_ORIGIN) {
            logger.info("CORS_ORIGIN not set, using default origins");
            return defaultOrigins;
        }

        try {
            const origins = process.env.CORS_ORIGIN.split(",").map(origin => origin.trim());
            const safeOrigins = origins.filter(origin => {
                // URLの形式を検証
                try {
                    new URL(origin);
                    // 不正な文字列パターンを除外
                    if (origin.includes("pathToRegexpError") || origin.includes("git.new")) {
                        logger.warn(`Filtering out invalid origin: ${origin}`);
                        return false;
                    }
                    return true;
                } catch (e) {
                    logger.warn(`Invalid origin URL format: ${origin}`);
                    return false;
                }
            });

            if (safeOrigins.length === 0) {
                logger.warn("No valid origins found in CORS_ORIGIN, using defaults");
                return defaultOrigins;
            }

            logger.info(`Using CORS origins: ${safeOrigins.join(", ")}`);
            return safeOrigins;
        } catch (error) {
            logger.error(`Error parsing CORS_ORIGIN: ${error.message}, using defaults`);
            return defaultOrigins;
        }
    }

    // CORS設定を強化
    app.use(cors({
        origin: getSafeOrigins(),
        methods: ["GET", "POST", "OPTIONS"], // OPTIONSメソッドを追加(プリフライトリクエスト対応)
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"], // 許可するヘッダーを明示
    }));

    // すべてのOPTIONSリクエストに対するプレフライト応答（Express 5のpath-to-regexp制約に対応）
    app.use((req, res, next) => {
        if (req.method === "OPTIONS") {
            res.header("Access-Control-Allow-Origin", getSafeOrigins());
            res.header("Vary", "Origin");
            res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
            return res.sendStatus(204);
        }
        next();
    });

    app.use(express.json());
    app.use(bodyParser.json());

    // ヘルスチェックエンドポイント
    app.get("/health", (req, res) => {
        res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
    });

    // 注意: /api/save-container エンドポイントはFirebase Functionsに移行しました
    // 注意: /api/get-user-containers エンドポイントはFirebase Functionsに移行しました
    // 注意: /api/get-container-users エンドポイントはFirebase Functionsに移行しました
    // 注意: /api/list-users エンドポイントはFirebase Functionsに移行しました

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

                    // Use environment variable for password check, fallback to null (fail safe)
                    const testUserPassword = process.env.TEST_USER_PASSWORD;

                    if (
                        testUserPassword && email === "test@example.com" &&
                        password === testUserPassword
                    ) {
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
                } catch (error) {
                    logger.error(`Development login error: ${error.message}`);
                }
            }

            // 本番環境では常にエラーを返す（実際の認証はFirebase SDKでクライアント側で行われる）
            return res.status(401).json({ error: "Invalid credentials" });
        } catch (error) {
            logger.error(`Login error: ${error.message}`);
            res.status(500).json({ error: "Authentication failed" });
        }
    });

    // 注意: /api/fluid-token エンドポイントは削除されました

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
        } catch (error) {
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
            } catch (error) {
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
        } catch (error) {
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
            } catch (error) {
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
            } catch (error) {
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
        } catch (error) {
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

    return app;
}

// Firebase初期化完了後にサーバーを起動
startServer().then(app => {
    module.exports = app;
}).catch(error => {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
});
