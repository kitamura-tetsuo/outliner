require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { generateToken } = require("@fluidframework/azure-service-utils");
const { ScopeType, IUser } = require("@fluidframework/azure-client");

// サービスアカウントJSONファイルのパス
const serviceAccountPath = path.join(__dirname, 'firebase-adminsdk.json');

// 環境変数のチェック
const requiredEnvVars = [
  'AZURE_TENANT_ID',
  'AZURE_FLUID_RELAY_ENDPOINT'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0)
{
  console.error('必須環境変数が設定されていません:', missingVars.join(', '));
  console.error('サーバーを起動する前に.envファイルを確認してください。');
  process.exit(1);
}

// Firebase認証情報JSONファイルの存在確認
if (!fs.existsSync(serviceAccountPath))
{
  console.error('Firebase認証情報ファイルが見つかりません:', serviceAccountPath);
  console.error('Firebase Admin SDKからダウンロードしたJSONファイルを上記のパスに配置してください。');
  process.exit(1);
}

// JSONファイルからFirebase認証情報を読み込む
let serviceAccount;
try
{
  serviceAccount = require('./firebase-adminsdk.json');
  console.log(`Firebase認証情報を読み込みました。プロジェクトID: ${serviceAccount.project_id}`);
} catch (error)
{
  console.error('Firebase認証情報ファイルの読み込みに失敗しました:', error);
  process.exit(1);
}

// Azure Fluid Relay設定
const azureConfig = {
  tenantId: process.env.AZURE_TENANT_ID,
  endpoint: process.env.AZURE_FLUID_RELAY_ENDPOINT,
  primaryKey: process.env.AZURE_PRIMARY_KEY,
  secondaryKey: process.env.AZURE_SECONDARY_KEY,
  // キーローテーション中はこれをsecondaryに設定
  activeKey: process.env.AZURE_ACTIVE_KEY || 'primary'
};

// Firebase初期化
try
{
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully');
} catch (error)
{
  console.error('Firebase初期化エラー:', error);
  process.exit(1);
}

const app = express();
// CORS設定を強化
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173', // 明示的にクライアントのURLを許可
  methods: ['GET', 'POST', 'OPTIONS'],  // OPTIONSメソッドを追加(プリフライトリクエスト対応)
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'] // 許可するヘッダーを明示
}));
app.use(express.json());

// プリフライトリクエスト用のルート
app.options('*', cors());

// ヘルスチェックエンドポイント
app.get('/health', (req, res) =>
{
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Firebase認証トークン検証とFluid Relay JWT生成を一括処理
app.post('/api/fluid-token', async (req, res) =>
{
  try
  {
    const { idToken, containerId } = req.body;
    if (!idToken)
    {
      return res.status(400).json({ error: 'IDトークンが必要です' });
    }

    // Firebaseトークンを検証
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // ユーザー情報を取得
    const userRecord = await admin.auth().getUser(uid);

    // ユーザー情報をログに記録
    console.log(`User authenticated: ${uid} (${userRecord.displayName || 'Anonymous'})`);

    // コンテナIDが指定されている場合はログに出力
    if (containerId)
    {
      console.log(`Generating token for container: ${containerId}`);
    }

    // Azure Fluidトークンを生成
    const result = generateAzureFluidToken({
      uid,
      displayName: userRecord.displayName || 'Anonymous User'
    }, containerId);

    res.json(result);
  } catch (error)
  {
    console.error('Token verification or generation error:', error);
    res.status(401).json({ error: '認証に失敗しました' });
  }
});

// デバッグ用: トークン内容を検証（開発環境のみ）
if (process.env.NODE_ENV !== 'production')
{
  app.get('/debug/token-info', async (req, res) =>
  {
    try
    {
      const { token } = req.query;

      if (!token)
      {
        return res.status(400).json({ error: 'トークンが必要です' });
      }

      // JWTをデコード（検証なし）
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded)
      {
        return res.status(400).json({ error: '無効なJWTトークンです' });
      }

      return res.json({
        header: decoded.header,
        payload: decoded.payload,
        // 署名は表示しない
        expiresIn: decoded.payload.exp ? new Date(decoded.payload.exp * 1000).toISOString() : 'N/A',
        issuedAt: decoded.payload.iat ? new Date(decoded.payload.iat * 1000).toISOString() : 'N/A',
      });
    } catch (error)
    {
      console.error('Token debug error:', error);
      res.status(500).json({ error: 'トークン情報の取得に失敗しました' });
    }
  });
}

// Azure Fluid Relay用トークン生成関数
function generateAzureFluidToken(user, containerId = undefined)
{
  // 使用するキーを決定
  const keyToUse = azureConfig.activeKey === 'secondary' && azureConfig.secondaryKey
    ? azureConfig.secondaryKey
    : azureConfig.primaryKey;

  if (!keyToUse)
  {
    console.warn('Azure Keyが設定されていません。テスト用トークンを生成します。');
    return {
      token: `test-token-${user.uid}-${Date.now()}`,
      user: { id: user.uid, name: user.displayName }
    };
  }

  try
  {
    // トークン生成前にテナントIDをログに出力して確認
    console.log(`Generating token with tenantId: ${azureConfig.tenantId}`);

    // コンテナID情報をログに出力
    if (containerId)
    {
      console.log(`Token will be scoped to container: ${containerId}`);
    }

    // 公式Fluid Service Utilsを使用してトークンを生成
    const fluidUser = {
      id: user.uid,
      name: user.displayName || 'Anonymous'
    };

    const token = generateToken(
      azureConfig.tenantId,  // テナントID
      keyToUse,        // 署名キー
      [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite], // 権限スコープ
      containerId,      // コンテナID (指定されていれば)
      fluidUser
    );

    // 使用したキーとテナントIDをログに記録（デバッグ用）
    console.log(`Generated token for user: ${user.uid} using ${azureConfig.activeKey} key and tenantId: ${azureConfig.tenantId}`);

    // JWT内容をデコードして確認（デバッグ用）
    const decoded = jwt.decode(token);
    console.log('Token payload:', decoded);

    return {
      token,
      user: {
        id: user.uid,
        name: user.displayName || 'Anonymous'
      },
      tenantId: azureConfig.tenantId, // クライアントに明示的にテナントIDを返す
      containerId: containerId || null   // 対象コンテナIDも返す
    };
  } catch (error)
  {
    console.error('Fluid token generation error:', error);
    throw new Error('トークン生成に失敗しました');
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
{
  console.log(`Auth service running on port ${PORT}`);
  console.log(`CORS origin: ${process.env.CORS_ORIGIN || '*'}`);
});
