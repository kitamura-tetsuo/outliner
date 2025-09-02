/**
 * log-service.jsファイルをテスト用にエクスポート可能にするためのヘルパーファイル
 * このファイルは直接サーバーを起動せず、Expressのミドルウェアのみをエクスポートします。
 */

// dotenvの設定を読み込み
require("dotenv").config({ path: ".env.test" });

// 必要なモジュール
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { generateToken } = require("@fluidframework/azure-service-utils");
const { ScopeType } = require("@fluidframework/azure-client");

// サービスアカウントの設定
// テスト用なのでJSONファイルのパスチェックはスキップ
const serviceAccount = {}; // テスト用の空オブジェクト

// Azure Fluid Relay設定
const azureConfig = {
    tenantId: process.env.AZURE_TENANT_ID || "test-tenant",
    endpoint: process.env.AZURE_FLUID_RELAY_ENDPOINT || "https://test.fluidrelay.azure.com",
    primaryKey: process.env.AZURE_PRIMARY_KEY || "test-key",
    activeKey: "primary",
};

// Firebaseの初期化（テスト用に最小構成）
// テスト環境でFirestoreエミュレーターを使用
if (process.env.NODE_ENV === "test" || process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";
    process.env.GCLOUD_PROJECT = "test-project";
}

admin.initializeApp({
    projectId: "test-project",
});

// データベース接続設定（テスト用）
const db = admin.firestore();
if (process.env.NODE_ENV === "test" || process.env.FIRESTORE_EMULATOR_HOST) {
    db.settings({
        host: "localhost:58080",
        ssl: false,
    });
}

const userContainersCollection = db.collection("userContainers");
const containerUsersCollection = db.collection("containerUsers");

// CORS_ORIGINの値を検証して安全な値のみを使用
function getSafeOrigins() {
    const defaultOrigins = ["http://localhost:7070"];

    if (!process.env.CORS_ORIGIN) {
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
                    console.warn(`Filtering out invalid origin: ${origin}`);
                    return false;
                }
                return true;
            } catch (e) {
                console.warn(`Invalid origin URL format: ${origin}`);
                return false;
            }
        });

        if (safeOrigins.length === 0) {
            return defaultOrigins;
        }

        return safeOrigins;
    } catch (error) {
        console.error(`Error parsing CORS_ORIGIN: ${error.message}, using defaults`);
        return defaultOrigins;
    }
}

// Expressアプリの作成
const app = express();
app.use(cors({
    origin: getSafeOrigins(),
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

// ヘルスチェックエンドポイント
app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// コンテナID保存エンドポイント
app.post("/api/save-container", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        // Firebase IDトークンを検証
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // ユーザードキュメントを取得
        const userDocRef = userContainersCollection.doc(userId);
        const docSnapshot = await userDocRef.get();

        // ドキュメントが存在するかでオペレーションを変更
        if (docSnapshot.exists) {
            await userDocRef.update({
                defaultContainerId: containerId,
                updatedAt: admin.FieldValue.serverTimestamp(),
            });

            res.status(200).json({
                success: true,
                operation: "updated",
                containerId: containerId,
            });
        } else {
            await userDocRef.set({
                userId,
                defaultContainerId: containerId,
                createdAt: admin.FieldValue.serverTimestamp(),
                updatedAt: admin.FieldValue.serverTimestamp(),
            });

            res.status(200).json({
                success: true,
                operation: "created",
                containerId: containerId,
            });
        }
    } catch (error) {
        if (error.message === "Invalid token") {
            res.status(401).json({ error: "Authentication failed", details: error.message });
        } else {
            console.error("Error saving container ID:", error);
            res.status(500).json({ error: "Failed to save container ID", details: error.message });
        }
    }
});

// コンテナにアクセス可能なユーザーのリストを取得するエンドポイント（管理者用）
app.post("/api/get-container-users", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.role !== "admin") {
            return res.status(403).json({ error: "Admin privileges required" });
        }

        const containerDoc = await containerUsersCollection.doc(containerId).get();

        if (!containerDoc.exists) {
            return res.status(404).json({ error: "Container not found" });
        }

        res.status(200).json({
            users: containerDoc.data().accessibleUserIds || [],
        });
    } catch (error) {
        console.error("Error getting container users:", error);
        res.status(500).json({ error: "Failed to get container users" });
    }
});

// 全ユーザー一覧を取得するエンドポイント（管理者用）
app.post("/api/list-users", async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: "ID token required" });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.role !== "admin") {
            return res.status(403).json({ error: "Admin privileges required" });
        }

        const result = await admin.auth().listUsers();
        const users = result.users.map(u => ({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
        }));

        res.status(200).json({ users });
    } catch (error) {
        console.error("Error listing users:", error);
        res.status(500).json({ error: "Failed to list users" });
    }
});

// デバッグ用エンドポイント
app.get("/debug/token-info", async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: "トークンが必要です" });
        }

        // JWTをデコード
        const decoded = require("jsonwebtoken").decode(token, { complete: true });

        if (!decoded) {
            return res.status(400).json({ error: "無効なJWTトークンです" });
        }

        return res.json({
            header: decoded.header,
            payload: decoded.payload,
            expiresIn: decoded.payload.exp ? new Date(decoded.payload.exp * 1000).toISOString() : "N/A",
            issuedAt: decoded.payload.iat ? new Date(decoded.payload.iat * 1000).toISOString() : "N/A",
        });
    } catch (error) {
        console.error("Token debug error:", error);
        res.status(500).json({ error: "トークン情報の取得に失敗しました" });
    }
});

// ログファイルをローテーションするエンドポイント
const {
    rotateClientLogs,
    rotateTelemetryLogs,
    rotateServerLogs,
    refreshClientLogStream,
    refreshTelemetryLogStream,
    refreshServerLogStream,
} = require("../utils/logger");

app.post("/api/rotate-logs", async (req, res) => {
    try {
        const clientRotated = await rotateClientLogs(2);
        const telemetryRotated = await rotateTelemetryLogs(2);
        const serverRotated = await rotateServerLogs(2);

        if (clientRotated) refreshClientLogStream();
        if (telemetryRotated) refreshTelemetryLogStream();
        if (serverRotated) refreshServerLogStream();

        res.status(200).json({
            success: true,
            clientRotated,
            telemetryRotated,
            serverRotated,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Azure Fluid Relay用トークン生成関数
function generateAzureFluidToken(user, containerId = undefined) {
    return {
        token: generateToken(
            azureConfig.tenantId,
            azureConfig.primaryKey,
            [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
            containerId,
            {
                id: user.uid,
                name: user.displayName || "Anonymous",
            },
        ),
        user: {
            id: user.uid,
            name: user.displayName || "Anonymous",
        },
        tenantId: azureConfig.tenantId,
        containerId: containerId || null,
    };
}

// テスト用にExpressアプリをエクスポート（サーバーは起動しない）
module.exports = app;
