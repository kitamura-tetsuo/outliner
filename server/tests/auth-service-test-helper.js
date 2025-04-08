/**
 * auth-service.jsファイルをテスト用にエクスポート可能にするためのヘルパーファイル
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

// Firebaseの初期化（モックが適用される）
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// データベース接続設定（モック）
const db = admin.firestore();
const userContainersCollection = db.collection("userContainers");

// Expressアプリの作成
const app = express();
app.use(cors());
app.use(express.json());

// ヘルスチェックエンドポイント
app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Fluid トークン生成エンドポイント
app.post("/api/fluid-token", async (req, res) => {
    try {
        const { idToken, containerId } = req.body;

        // Firebase IDトークンを検証
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // コンテナIDの取得（指定されていればそれを使用、なければユーザーのデフォルト）
        let targetContainerId = containerId;

        if (!targetContainerId) {
            // ユーザーのデフォルトコンテナを取得
            const userDocRef = userContainersCollection.doc(userId);
            const userDoc = await userDocRef.get();

            if (userDoc.exists && userDoc.data().defaultContainerId) {
                targetContainerId = userDoc.data().defaultContainerId;
            }
        }

        // Azure Fluid RelayのJWT生成
        const jwt = generateAzureFluidToken({
            uid: userId,
            displayName: decodedToken.name || "Anonymous User",
        }, targetContainerId);

        // レスポンスを返す
        res.status(200).json({
            token: jwt.token,
            user: {
                id: userId,
                name: decodedToken.name || "Anonymous User",
            },
            tenantId: azureConfig.tenantId,
            containerId: targetContainerId,
        });
    }
    catch (error) {
        console.error("Token validation error:", error);
        res.status(401).json({ error: "Authentication failed", details: error.message });
    }
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
        }
        else {
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
    }
    catch (error) {
        if (error.message === "Invalid token") {
            res.status(401).json({ error: "Authentication failed", details: error.message });
        }
        else {
            console.error("Error saving container ID:", error);
            res.status(500).json({ error: "Failed to save container ID", details: error.message });
        }
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
    }
    catch (error) {
        console.error("Token debug error:", error);
        res.status(500).json({ error: "トークン情報の取得に失敗しました" });
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
