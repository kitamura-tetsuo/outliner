require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// サービスアカウントJSONファイルのパス
const serviceAccountPath = path.join(__dirname, 'firebase-adminsdk.json');

// 環境変数のチェック（Firebase認証情報を除外）
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
  key: process.env.AZURE_PRIMARY_KEY
};

// セッション情報を一時的に保存するためのマップ
// 注: 本番環境ではRedisなどの永続ストレージを使用すべき
const sessions = new Map();

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
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// ヘルスチェックエンドポイント
app.get('/health', (req, res) =>
{
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Firebase認証トークン検証エンドポイント
app.post('/api/verify-token', async (req, res) =>
{
  try
  {
    const { idToken } = req.body;
    if (!idToken)
    {
      return res.status(400).json({ error: 'IDトークンが必要です' });
    }

    // Firebaseトークンを検証
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // セッションIDを生成
    const sessionId = uuidv4();

    // ユーザー情報を取得
    const userRecord = await admin.auth().getUser(uid);

    // セッション情報を保存
    sessions.set(sessionId, {
      uid,
      displayName: userRecord.displayName || 'Anonymous User',
      email: userRecord.email,
      photoURL: userRecord.photoURL,
      createdAt: Date.now()
    });

    console.log(`User ${uid} (${userRecord.displayName || 'Anonymous'}) authenticated, session created: ${sessionId}`);

    // セッションIDをクライアントに返す
    res.json({
      sessionId,
      user: {
        uid,
        displayName: userRecord.displayName,
        email: userRecord.email,
        photoURL: userRecord.photoURL
      }
    });
  } catch (error)
  {
    console.error('Token verification error:', error);
    res.status(401).json({ error: '認証に失敗しました' });
  }
});

// Azure Fluid Relay用トークン生成関数
function generateAzureFluidToken(user)
{
  if (!azureConfig.key)
  {
    console.warn('Azure Primary Keyが設定されていません。テスト用トークンを生成します。');
    return {
      token: `test-token-${user.uid}-${Date.now()}`,
      user: { id: user.uid, name: user.displayName }
    };
  }

  try
  {
    // トークンの有効期限（1時間）
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;

    // トークンのペイロード
    const claims = {
      user: {
        id: user.uid,
        name: user.displayName || 'Anonymous'
      },
      aud: azureConfig.tenantId,
      iss: 'outliner-auth-server',
      sub: user.uid,
      iat: now,
      exp,
      jti: uuidv4()
    };

    // JWTの署名
    const token = jwt.sign(claims, azureConfig.key, { algorithm: 'HS256' });

    return {
      token,
      user: claims.user
    };
  } catch (error)
  {
    console.error('Fluid token generation error:', error);
    throw new Error('トークン生成に失敗しました');
  }
}

// Azure Fluid Relay用トークン取得エンドポイント
app.post('/api/fluid-token', async (req, res) =>
{
  try
  {
    const { sessionId } = req.body;
    if (!sessionId || !sessions.has(sessionId))
    {
      return res.status(401).json({ error: '有効なセッションが見つかりません' });
    }

    const session = sessions.get(sessionId);

    // Azure Fluidトークンを生成
    const result = generateAzureFluidToken({
      uid: session.uid,
      displayName: session.displayName
    });

    res.json(result);
  } catch (error)
  {
    console.error('Fluid token error:', error);
    res.status(500).json({ error: 'トークン生成に失敗しました' });
  }
});

// セッションクリーンアップ（24時間で期限切れ）
setInterval(() =>
{
  const now = Date.now();
  let expiredCount = 0;

  for (const [key, session] of sessions.entries())
  {
    if (now - session.createdAt > 24 * 60 * 60 * 1000)
    {
      sessions.delete(key);
      expiredCount++;
    }
  }

  if (expiredCount > 0)
  {
    console.log(`${expiredCount}個の期限切れセッションを削除しました。残り: ${sessions.size}個`);
  }
}, 60 * 60 * 1000); // 1時間ごとにクリーンアップ

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
{
  console.log(`Auth service running on port ${PORT}`);
  console.log(`CORS origin: ${process.env.CORS_ORIGIN || '*'}`);
});
