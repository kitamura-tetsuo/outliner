const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { generateToken } = require("@fluidframework/azure-service-utils");
const { ScopeType } = require("@fluidframework/azure-client");
const jwt = require("jsonwebtoken");
const { FieldValue } = require("firebase-admin/firestore");

// CORS設定を共通化する関数
function setCorsHeaders(req, res) {
  const allowedOrigins = [
    "http://localhost:7090",
    "http://localhost:7091",
    "http://localhost:7092",
    "http://localhost:57000",
    "https://outliner-d57b0.web.app"
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }

  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
// ロガーの設定
const logger = require("firebase-functions/logger");

// 環境変数を読み込み
require("dotenv").config();

// 環境変数を直接使用（ローカル開発用）
const azureConfig = {
  tenantId: process.env.AZURE_TENANT_ID,
  endpoint: process.env.AZURE_ENDPOINT,
  primaryKey: process.env.AZURE_PRIMARY_KEY,
  secondaryKey: process.env.AZURE_SECONDARY_KEY,
  activeKey: process.env.AZURE_ACTIVE_KEY,
};

// Firebase Admin SDKの初期化（テスト環境では既に初期化済みの場合がある）
if (!admin.apps.length) {
  admin.initializeApp();
}

// Firestoreの参照を取得
const db = admin.firestore();
const userContainersCollection = db.collection("userContainers");

// Azure Fluid Relay設定（上記で定義済み）

// 必須の環境変数が設定されているか確認
if (!azureConfig.tenantId) {
  logger.error("Azure Tenant ID (AZURE_TENANT_ID) が設定されていません。");
}
if (!azureConfig.endpoint) {
  logger.error("Azure Endpoint (AZURE_ENDPOINT) が設定されていません。");
}
if (!azureConfig.primaryKey) {
  logger.error("Azure Primary Key (AZURE_PRIMARY_KEY) が設定されていません。");
}

// CORS設定（削除 - 各エンドポイントで直接設定）

// 設定値をログに出力（デバッグ用）
logger.info("Azure Fluid Relay設定:", {
  tenantId: azureConfig.tenantId,
  endpoint: azureConfig.endpoint,
  primaryKeyExists: !!azureConfig.primaryKey,
  secondaryKeyExists: !!azureConfig.secondaryKey,
  activeKey: azureConfig.activeKey
});

/**
 * Azure Fluid Relay用トークン生成関数
 * @param {Object} user - ユーザー情報
 * @param {string} user.uid - ユーザーID
 * @param {string} user.displayName - ユーザー表示名
 * @param {string} containerId - コンテナID（オプション）
 * @param {'owner' | 'editor' | 'viewer'} role - ユーザーのロール
 * @return {Object} 生成されたトークン情報
 */
function generateAzureFluidToken(user, containerId = undefined, role = 'viewer') { // Default to 'viewer' if role not specified, though it should be.
  // グローバルのazureConfigを使用
  // 使用するキーを決定
  const keyToUse = azureConfig.activeKey === "secondary" &&
    azureConfig.secondaryKey ?
    azureConfig.secondaryKey :
    azureConfig.primaryKey;

  if (!keyToUse) {
    logger.error("Azure Keyが設定されていません。環境変数を確認してください。");
    throw new Error("Azure Key is not configured");
  }

  if (!azureConfig.tenantId) {
    logger.error("Azure Tenant IDが設定されていません。環境変数を確認してください。");
    throw new Error("Azure Tenant ID is not configured");
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

    let scopes;
    if (role === 'owner' || role === 'editor') {
      scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
    } else { // viewer
      scopes = [ScopeType.DocRead, ScopeType.SummaryWrite];
    }
    logger.info(`Generating token for user ${user.uid} with role ${role} and scopes: ${scopes.join(', ')} for container ${containerId}`);

    const token = generateToken(
      azureConfig.tenantId, // テナントID
      keyToUse, // 署名キー
      scopes, // 権限スコープ based on role
      containerId, // コンテナID (指定されていれば)
      fluidUser,
    );

    // 使用したキーとテナントIDをログに記録（デバッグ用）
    logger.info(
      `Generated token for user: ${user.uid} ` +
      `using ${azureConfig.activeKey} ` +
      `key and tenantId: ${azureConfig.tenantId}`,
    );

    // JWT内容をデコードして確認（デバッグ用）
    const decoded = jwt.decode(token);
    logger.debug(
      `Token payload: ${JSON.stringify(decoded)}`,
    );

    return {
      token,
      user: {
        id: user.uid,
        name: user.displayName || "Anonymous",
      },
      tenantId: azureConfig.tenantId, // クライアントに明示的にテナントIDを返す
      containerId: containerId || null, // 対象コンテナIDも返す
    };
  } catch (error) {
    logger.error(`Fluid token generation error: ${error.message}`, { error });
    throw new Error("トークン生成に失敗しました");
  }
}

// Firebase認証トークン検証とFluid Relay JWT生成を一括処理するFunction
exports.fluidToken = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // POSTメソッド以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { idToken, containerId } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "ID token is required" });
    }

    // Firebase IDトークンを検証
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // containerId must be provided by the client
    if (!containerId) {
      logger.warn(`User ${userId} requested token without specifying containerId.`);
      return res.status(400).json({ error: "Container ID is required." });
    }

    // ユーザーのコンテナ情報を取得
    const userDoc = await userContainersCollection.doc(userId).get();

    if (!userDoc.exists) {
      logger.warn(`User document not found for UID: ${userId}. Denying token.`);
      return res.status(404).json({ error: "User data not found." });
    }

    const userData = userDoc.data();
    const accessibleContainers = userData.accessibleContainers || [];

    const targetContainerAccess = accessibleContainers.find(c => c.id === containerId);

    if (!targetContainerAccess) {
      logger.warn(`User ${userId} does not have access to container ${containerId}. Denying token.`);
      return res.status(403).json({
        error: `Access to container ${containerId} is denied.`,
      });
    }

    const userRoleForContainer = targetContainerAccess.role;
    logger.info(`User ${userId} has role '${userRoleForContainer}' for container ${containerId}.`);

    // Azure設定はグローバルのazureConfigを使用

    // Azure Fluid RelayのJWT生成
    const fluidTokenData = generateAzureFluidToken(
      {
        uid: userId,
        displayName: decodedToken.name || decodedToken.displayName || "Anonymous User",
      },
      containerId, // Use the validated containerId
      userRoleForContainer // Pass the determined role
    );

    // レスポンスを返す
    return res.status(200).json({
      token: fluidTokenData.token,
      user: {
        id: userId,
        name: decodedToken.name || decodedToken.displayName || "Anonymous User",
      },
      tenantId: azureConfig.tenantId,
      containerId: containerId, // Return the specific containerId for which token was issued
      // defaultContainerId: userData.defaultContainerId, // Consider if this is still needed
      // accessibleContainers: accessibleContainers, // Consider if this is still needed
    });
  } catch (error) {
    logger.error(`Token validation error: ${error.message}`, { error });
    return res.status(401).json({ error: "Authentication failed" });
  }
});

// ユーザーのコンテナIDを保存するエンドポイント
exports.saveContainer = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // POSTメソッド以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

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
      await db.runTransaction(async (transaction) => {
        const userDocRef = userContainersCollection.doc(userId);
        const containerDocRef =
          db.collection("containerUsers").doc(containerId);

        // すべての読み取り操作を先に実行
        const userDoc = await transaction.get(userDocRef);
        const containerDoc = await transaction.get(containerDocRef);

        // 読み取り完了後に書き込み操作を開始
        // ユーザーのデフォルトコンテナIDとアクセス可能なコンテナIDを更新
        if (userDoc.exists) {
          const userData = userDoc.data();
          const accessibleContainerIds =
            userData.accessibleContainerIds || [];

          if (!accessibleContainerIds.includes(containerId)) {
            accessibleContainerIds.push(containerId);
          }

          transaction.update(userDocRef, {
            defaultContainerId: containerId,
            accessibleContainerIds,
            updatedAt:
              FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(userDocRef, {
            userId,
            defaultContainerId: containerId,
            accessibleContainerIds: [containerId],
            createdAt:
              FieldValue.serverTimestamp(),
            updatedAt:
              FieldValue.serverTimestamp(),
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
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(containerDocRef, {
            containerId,
            accessibleUserIds: [userId],
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      logger.info(`Saved container ID ${containerId} for user ${userId}`);
      return res.status(200).json({ success: true });
    } catch (firestoreError) {
      logger.error(
        `Firestore error while saving container ID: ` +
        `${firestoreError.message}`,
        { error: firestoreError },
      );
      return res.status(500).json({
        error: "Database error while saving container ID",
      });
    }
  } catch (error) {
    logger.error(`Error saving container ID: ${error.message}`, { error });
    return res.status(500).json({ error: "Failed to save container ID" });
  }
});

// ユーザーがアクセス可能なコンテナIDのリストを取得するエンドポイント
exports.getUserContainers = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // POSTメソッド以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

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

    return res.status(200).json({
      containers: userData.accessibleContainerIds || [],
      defaultContainerId: userData.defaultContainerId || null,
    });
  } catch (error) {
    logger.error(`Error getting user containers: ${error.message}`, { error });
    return res.status(500).json({ error: "Failed to get user containers" });
  }
});

// ユーザーを削除するエンドポイント
exports.deleteUser = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // POSTメソッド以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "ID token is required" });
    }

    // Firebaseトークンを検証
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    try {
      // Firestoreトランザクションを使用してユーザー関連データを削除
      await db.runTransaction(async (transaction) => {
        // ユーザーのコンテナ情報を取得
        const userDocRef = userContainersCollection.doc(userId);
        const userDoc = await transaction.get(userDocRef);

        if (userDoc.exists) {
          const userData = userDoc.data();
          const accessibleContainerIds = userData.accessibleContainerIds || [];

          // ユーザーがアクセス可能な各コンテナから、ユーザーIDを削除
          for (const containerId of accessibleContainerIds) {
            const containerDocRef = db.collection("containerUsers").doc(containerId);
            const containerDoc = await transaction.get(containerDocRef);

            if (containerDoc.exists) {
              const containerData = containerDoc.data();
              const accessibleUserIds = containerData.accessibleUserIds || [];

              // ユーザーIDを削除
              const updatedUserIds = accessibleUserIds.filter((id) => id !== userId);

              if (updatedUserIds.length === 0) {
                // ユーザーがいなくなった場合はコンテナドキュメントを削除
                transaction.delete(containerDocRef);
              } else {
                // ユーザーIDを更新
                transaction.update(containerDocRef, {
                  accessibleUserIds: updatedUserIds,
                  updatedAt: FieldValue.serverTimestamp(),
                });
              }
            }
          }

          // ユーザーのコンテナ情報を削除
          transaction.delete(userDocRef);
        }
      });

      // Firebase Authからユーザーを削除
      await admin.auth().deleteUser(userId);

      logger.info(`User ${userId} and related data deleted successfully`);
      return res.status(200).json({ success: true });
    } catch (firestoreError) {
      logger.error(
        `Firestore error while deleting user: ${firestoreError.message}`,
        { error: firestoreError },
      );
      return res.status(500).json({
        error: "Database error while deleting user",
      });
    }
  } catch (error) {
    logger.error(`Error deleting user: ${error.message}`, { error });
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

// コンテナを削除するエンドポイント
exports.deleteContainer = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // POSTメソッド以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { idToken, containerId } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "ID token is required" });
    }

    if (!containerId) {
      return res.status(400).json({ error: "Container ID is required" });
    }

    // Firebaseトークンを検証
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    try {
      // Firestoreトランザクションを使用してコンテナ関連データを削除
      await db.runTransaction(async (transaction) => {
        // コンテナ情報を取得
        const containerDocRef = db.collection("containerUsers").doc(containerId);
        const containerDoc = await transaction.get(containerDocRef);

        if (!containerDoc.exists) {
          throw new Error("Container not found");
        }

        const containerData = containerDoc.data();
        const accessibleUserIds = containerData.accessibleUserIds || [];

        // ユーザーがこのコンテナにアクセスできるか確認
        if (!accessibleUserIds.includes(userId)) {
          throw new Error("Access to the container is denied");
        }

        // コンテナにアクセスできる各ユーザーから、コンテナIDを削除
        for (const accessUserId of accessibleUserIds) {
          const userDocRef = userContainersCollection.doc(accessUserId);
          const userDoc = await transaction.get(userDocRef);

          if (userDoc.exists) {
            const userData = userDoc.data();
            const accessibleContainerIds = userData.accessibleContainerIds || [];

            // コンテナIDを削除
            const updatedContainerIds = accessibleContainerIds.filter((id) => id !== containerId);

            // デフォルトコンテナの更新
            let defaultContainerId = userData.defaultContainerId;
            if (defaultContainerId === containerId) {
              defaultContainerId = updatedContainerIds.length > 0 ? updatedContainerIds[0] : null;
            }

            transaction.update(userDocRef, {
              accessibleContainerIds: updatedContainerIds,
              defaultContainerId: defaultContainerId,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }

        // コンテナドキュメントを削除
        transaction.delete(containerDocRef);
      });

      logger.info(`Container ${containerId} deleted successfully`);
      return res.status(200).json({ success: true });
    } catch (firestoreError) {
      logger.error(
        `Firestore error while deleting container: ${firestoreError.message}`,
        { error: firestoreError },
      );

      if (firestoreError.message === "Container not found") {
        return res.status(404).json({ error: "Container not found" });
      }

      if (firestoreError.message === "Access to the container is denied") {
        return res.status(403).json({ error: "Access to the container is denied" });
      }

      return res.status(500).json({
        error: "Database error while deleting container",
      });
    }
  } catch (error) {
    logger.error(`Error deleting container: ${error.message}`, { error });
    return res.status(500).json({ error: "Failed to delete container" });
  }
});

// ヘルスチェックエンドポイント
exports.health = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// Project Sharing
exports.shareProject = require("./src/shareProject").shareProject;
exports.manageProjectMembers = require("./src/manageProjectMembers").manageProjectMembers;
exports.getProjectMembers = require("./src/getProjectMembers").getProjectMembers;

// 下書き公開機能をインポート
const { publishDraft, publishDraftScheduled, publishDraftTest } = require("./src/draftPublisher");

// スケジュール公開機能をインポート
const {
  publishScheduledDraft,
  createCloudTask,
  deleteCloudTask
} = require("./src/scheduledPublisher");

// 下書き公開エンドポイント
exports.publishDraft = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // POSTメソッド以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { draftId, containerId, projectData, idToken } = req.body;

    logger.info("Received publishDraft request", {
      draftId,
      containerId,
      hasProjectData: !!projectData,
      hasIdToken: !!idToken,
      requestBody: JSON.stringify(req.body).substring(0, 500)
    });

    if (!draftId || !containerId || !projectData || !idToken) {
      logger.error("Missing required fields", {
        draftId: !!draftId,
        containerId: !!containerId,
        projectData: !!projectData,
        idToken: !!idToken
      });
      return res.status(400).json({
        error: "Missing required fields: draftId, containerId, projectData, idToken"
      });
    }

    // テスト環境かどうかを判定
    const isTestEnvironment = process.env.NODE_ENV === "test" ||
                             process.env.FUNCTIONS_EMULATOR === "true";

    let result;
    if (isTestEnvironment) {
      result = await publishDraftTest(req.body);
    } else {
      result = await publishDraft(req.body);
    }

    return res.status(200).json(result);
  } catch (error) {
    logger.error(`Error publishing draft: ${error.message}`, { error });
    return res.status(500).json({ error: "Failed to publish draft" });
  }
});

// 指定時刻下書き公開エンドポイント（Cloud Tasks用）
exports.publishDraftScheduled = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // POSTメソッド以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { draftId, containerId, projectData, authorId } = req.body;

    if (!draftId || !containerId || !projectData || !authorId) {
      return res.status(400).json({
        error: "Missing required fields: draftId, containerId, projectData, authorId"
      });
    }

    const result = await publishDraftScheduled(req.body);
    return res.status(200).json(result);
  } catch (error) {
    logger.error(`Error publishing scheduled draft: ${error.message}`, { error });
    return res.status(500).json({ error: "Failed to publish scheduled draft" });
  }
});

// スケジュール公開エンドポイント（Cloud Tasksから呼び出される）
exports.publishScheduledDraft = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // POSTメソッド以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    logger.info("Received publishScheduledDraft request", {
      body: JSON.stringify(req.body).substring(0, 500)
    });

    const result = await publishScheduledDraft(req.body);
    return res.status(200).json(result);
  } catch (error) {
    logger.error(`Error in publishScheduledDraft: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      error: "Failed to publish scheduled draft",
      message: error.message
    });
  }
});

// Cloud Tasksタスク作成エンドポイント
exports.createCloudTask = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // POSTメソッド以外は拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { taskName, scheduleTime, targetUrl, payload, retryConfig } = req.body;

    if (!taskName || !scheduleTime || !targetUrl || !payload) {
      return res.status(400).json({
        error: "Missing required fields: taskName, scheduleTime, targetUrl, payload"
      });
    }

    const taskOptions = {
      taskName,
      scheduleTime,
      targetUrl,
      payload,
      httpMethod: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      retryConfig,
    };

    const taskId = await createCloudTask(taskOptions);

    logger.info("Cloud Task created successfully", { taskName, taskId });
    return res.status(200).json({
      success: true,
      taskId
    });
  } catch (error) {
    logger.error(`Error creating Cloud Task: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      error: "Failed to create Cloud Task",
      message: error.message
    });
  }
});

// Cloud Tasksタスク削除エンドポイント
exports.deleteCloudTask = onRequest({ cors: true }, async (req, res) => {
  // CORS設定
  setCorsHeaders(req, res);

  // プリフライト OPTIONS リクエストの処理
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // DELETEメソッド以外は拒否
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({
        error: "Missing required field: taskId"
      });
    }

    const success = await deleteCloudTask(taskId);

    logger.info("Cloud Task deleted successfully", { taskId });
    return res.status(200).json({
      success
    });
  } catch (error) {
    logger.error(`Error deleting Cloud Task: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      error: "Failed to delete Cloud Task",
      message: error.message
    });
  }
});
