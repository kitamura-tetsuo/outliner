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

// データベース接続設定 - 例としてFirestoreを使用
const db = admin.firestore();
const userContainersCollection = db.collection('userContainers');
const containerUsersCollection = db.collection('containerUsers');

// ユーザーのコンテナIDを保存するエンドポイント
app.post('/api/save-container', async (req, res) => {
  try {
    const { idToken, containerId } = req.body;

    if (!containerId) {
      return res.status(400).json({ error: 'Container ID is required' });
    }

    // Firebaseトークンを検証
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    try {
      // Firestoreトランザクションを使用して両方のコレクションを更新
      await db.runTransaction(async (transaction) => {
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
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          transaction.set(userDocRef, {
            userId,
            defaultContainerId: containerId,
            accessibleContainerIds: [containerId],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          transaction.set(containerDocRef, {
            containerId,
            accessibleUserIds: [userId],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });

      console.log(`Saved container ID ${containerId} for user ${userId}`);
      res.status(200).json({ success: true });
    } catch (firestoreError) {
      console.error('Firestore error while saving container ID:', firestoreError);
      res.status(500).json({ error: 'Database error while saving container ID' });
    }
  } catch (error) {
    console.error('Error saving container ID:', error);
    res.status(500).json({ error: 'Failed to save container ID' });
  }
});

// ユーザーがアクセス可能なコンテナIDのリストを取得するエンドポイント
app.post('/api/get-user-containers', async (req, res) =>
{
  try
  {
    const { idToken } = req.body;

    // Firebaseトークンを検証
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const userDoc = await userContainersCollection.doc(userId).get();

    if (!userDoc.exists)
    {
      return res.status(200).json({ containers: [], defaultContainerId: null });
    }

    const userData = userDoc.data();

    res.status(200).json({
      containers: userData.accessibleContainerIds || [],
      defaultContainerId: userData.defaultContainerId || null
    });
  } catch (error)
  {
    console.error('Error getting user containers:', error);
    res.status(500).json({ error: 'Failed to get user containers' });
  }
});

// コンテナにアクセス可能なユーザーのリストを取得するエンドポイント（管理者用）
app.post('/api/get-container-users', async (req, res) =>
{
  try
  {
    const { idToken, containerId } = req.body;

    if (!containerId)
    {
      return res.status(400).json({ error: 'Container ID is required' });
    }

    // Firebaseトークンを検証
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // TODO: 管理者権限チェックを追加する場合はここに実装

    const containerDoc = await containerUsersCollection.doc(containerId).get();

    if (!containerDoc.exists)
    {
      return res.status(404).json({ error: 'Container not found' });
    }

    const containerData = containerDoc.data();

    res.status(200).json({
      users: containerData.accessibleUserIds || []
    });
  } catch (error)
  {
    console.error('Error getting container users:', error);
    res.status(500).json({ error: 'Failed to get container users' });
  }
});

// Firebase認証トークン検証とFluid Relay JWT生成を一括処理
app.post('/api/fluid-token', async (req, res) => {
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
      console.log(`No container ID specified, using default container: ${defaultContainerId}`);
      targetContainerId = defaultContainerId;
    }

    // コンテナIDが指定されている場合はアクセス権をチェック
    if (targetContainerId && accessibleContainerIds.length > 0) {
      if (!accessibleContainerIds.includes(targetContainerId)) {
        return res.status(403).json({ error: 'Access to the container is denied' });
      }
    }

    // Azure Fluid RelayのJWT生成
    const jwt = generateAzureFluidToken({
      uid: userId,
      displayName: decodedToken.name || 'Anonymous User'
    }, targetContainerId);

    // レスポンスを返す
    res.status(200).json({
      token: jwt.token,
      user: {
        id: userId,
        name: decodedToken.name || 'Anonymous User'
      },
      tenantId: azureConfig.tenantId,
      containerId: targetContainerId,
      defaultContainerId,
      accessibleContainerIds
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ error: 'Authentication failed' });
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
