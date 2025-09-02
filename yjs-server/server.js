#!/usr/bin/env node

import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { existsSync, rmSync } from "fs";
import { dirname, join } from "path";
import pino from "pino";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { LeveldbPersistence } from "y-leveldb";
import { setupWSConnection } from "y-websocket/bin/utils";

// ES modules用の__dirname取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 環境変数の設定
const PORT = process.env.PORT || 1234;
const HOST = process.env.HOST || "0.0.0.0";
const YPERSISTENCE = process.env.YPERSISTENCE || "./yjs-data";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// ロガーの設定
const logger = pino({
    level: LOG_LEVEL,
    // テスト環境では簡単なログ出力を使用
    ...(process.env.NODE_ENV === "test" ? {} : {
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:standard",
            },
        },
    }),
});

// Firebase Admin SDKの初期化
let firebaseApp;
const isTestEnv = process.env.NODE_ENV === "test";
const useEmulator = process.env.USE_FIREBASE_EMULATOR === "true";

if (isTestEnv && !useEmulator) {
    logger.info("Running in test mode - Firebase authentication disabled");
} else {
    try {
        if (useEmulator) {
            // Firebase emulator使用時の設定
            logger.info("Using Firebase emulator for authentication");
            firebaseApp = initializeApp({
                projectId: process.env.FIREBASE_PROJECT_ID || "outliner-d57b0",
            });
        } else {
            // 本番環境での設定
            const serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            };

            if (!serviceAccount.projectId || !serviceAccount.privateKey || !serviceAccount.clientEmail) {
                throw new Error("Firebase credentials are missing");
            }

            firebaseApp = initializeApp({
                credential: cert(serviceAccount),
                projectId: serviceAccount.projectId,
            });
        }

        logger.info("Firebase Admin SDK initialized");
    } catch (error) {
        logger.error("Failed to initialize Firebase Admin SDK:", error);
        process.exit(1);
    }
}

// 永続化の設定
// テスト環境（NODE_ENV=test）のときは信頼性のため永続化を無効化（メモリのみ）
let persistence;
if (isTestEnv) {
    persistence = undefined;
    logger.warn("Running in test mode: disabling LevelDB persistence (in-memory only)");
} else {
    try {
        // 前回の異常終了などで残ったロックファイルを除去
        const lockFile = join(YPERSISTENCE, "LOCK");
        try {
            if (existsSync(lockFile)) {
                rmSync(lockFile, { force: true });
                logger.warn(`Removed stale LevelDB lock file at: ${lockFile}`);
            }
        } catch (e) {
            logger.warn(`Failed to remove stale lock file at startup: ${e?.message}`);
        }

        persistence = new LeveldbPersistence(YPERSISTENCE);
        logger.info(`LevelDB persistence initialized at: ${YPERSISTENCE}`);
    } catch (error) {
        logger.error("Failed to initialize LevelDB persistence at startup:", error);
        process.exit(1);
    }
}

// WebSocketサーバーの作成
const wss = new WebSocketServer({
    port: PORT,
    host: HOST,
    perMessageDeflate: {
        zlibDeflateOptions: {
            threshold: 1024,
            concurrencyLimit: 10,
        },
        threshold: 1024,
    },
});

logger.info(`Yjs WebSocket server listening on ${HOST}:${PORT}`);

// 接続統計
const stats = {
    connections: 0,
    rooms: new Set(),
    startTime: Date.now(),
};

/**
 * Firebase IDトークンを検証
 */
async function verifyFirebaseToken(token) {
    // テスト環境で emulator を使用しない場合は認証をスキップ
    if (isTestEnv && !useEmulator) {
        return {
            success: true,
            uid: "test-user",
            email: "test@example.com",
            name: "Test User",
        };
    }

    try {
        const decodedToken = await getAuth(firebaseApp).verifyIdToken(token);
        return {
            success: true,
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name || decodedToken.display_name,
        };
    } catch (error) {
        logger.warn("Firebase token verification failed:", error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * ルーム名の検証
 */
function validateRoomName(roomName) {
    // project:<projectId> または page:<projectId>:<pageId> の形式をチェック
    const projectPattern = /^project:[a-zA-Z0-9_-]+$/;
    const pagePattern = /^page:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/;

    return projectPattern.test(roomName) || pagePattern.test(roomName);
}

/**
 * WebSocket接続ハンドラー
 */
wss.on("connection", async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomName = url.pathname.slice(1); // 先頭の'/'を除去
    const authToken = url.searchParams.get("auth");

    logger.info(`New connection attempt for room: ${roomName}`);

    // ルーム名の検証
    if (!validateRoomName(roomName)) {
        logger.warn(`Invalid room name: ${roomName}`);
        ws.close(1008, "Invalid room name");
        return;
    }

    // 認証トークンの検証
    if (!authToken) {
        logger.warn("No auth token provided");
        ws.close(1008, "Authentication required");
        return;
    }

    const authResult = await verifyFirebaseToken(authToken);
    if (!authResult.success) {
        logger.warn(`Authentication failed for room ${roomName}: ${authResult.error}`);
        ws.close(1008, "Authentication failed");
        return;
    }

    logger.info(`User authenticated: ${authResult.email} (${authResult.uid}) joined room: ${roomName}`);

    // 統計を更新
    stats.connections++;
    stats.rooms.add(roomName);

    // WebSocketにユーザー情報を追加
    ws.user = {
        uid: authResult.uid,
        email: authResult.email,
        name: authResult.name,
    };
    ws.roomName = roomName;

    // y-websocketの接続セットアップ
    try {
        setupWSConnection(ws, req, {
            docName: roomName,
            persistence,
        });

        logger.info(`WebSocket connection established for ${authResult.email} in room: ${roomName}`);
    } catch (error) {
        logger.error("Failed to setup WebSocket connection:", error);
        ws.close(1011, "Internal server error");
        return;
    }

    // 接続終了時の処理
    ws.on("close", (code, reason) => {
        stats.connections--;
        logger.info(
            `Connection closed for ${authResult.email} in room: ${roomName} (code: ${code}, reason: ${reason})`,
        );
    });

    // エラーハンドリング
    ws.on("error", (error) => {
        logger.error(`WebSocket error for ${authResult.email} in room: ${roomName}:`, error);
    });
});

// サーバーエラーハンドリング
wss.on("error", (error) => {
    logger.error("WebSocket server error:", error);
});

// 統計情報のログ出力（5分ごと）
setInterval(() => {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    logger.info(`Server stats - Connections: ${stats.connections}, Rooms: ${stats.rooms.size}, Uptime: ${uptime}s`);
}, 5 * 60 * 1000);

// グレースフルシャットダウン
process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down gracefully...");

    wss.clients.forEach((ws) => {
        ws.close(1001, "Server shutting down");
    });

    wss.close(() => {
        logger.info("WebSocket server closed");
        if (persistence) {
            persistence.destroy().then(() => {
                logger.info("LevelDB persistence closed");
                process.exit(0);
            }).catch((error) => {
                logger.error("Error closing LevelDB persistence:", error);
                process.exit(1);
            });
        } else {
            process.exit(0);
        }
    });
});

process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down gracefully...");
    process.kill(process.pid, "SIGINT");
});

// 未処理の例外をキャッチ
process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    logger.fatal("Uncaught exception:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
    });
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled rejection:", reason);
    logger.fatal("Unhandled rejection:", {
        reason: reason,
        promise: promise,
        stack: reason?.stack,
    });
    process.exit(1);
});

logger.info("Yjs server started successfully");
