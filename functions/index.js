const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const { generateToken } = require("@fluidframework/azure-service-utils");
const { ScopeType } = require("@fluidframework/azure-client");
const jwt = require("jsonwebtoken");
const { defineString } = require("firebase-functions/params");

// ロガーの設定
const logger = require("firebase-functions/logger");

// Firebase Functions v2 のパラメータ定義
const tenantId = defineString("AZURE_TENANT_ID");
const endpoint = defineString("AZURE_ENDPOINT");
const primaryKey = defineString("AZURE_PRIMARY_KEY");
const secondaryKey = defineString("AZURE_SECONDARY_KEY");
const activeKey = defineString("AZURE_ACTIVE_KEY");

// Firebase Admin SDKの初期化
admin.initializeApp();

// Firestoreの参照を取得
const db = admin.firestore();
const userContainersCollection = db.collection("userContainers");

// Azure Fluid Relay設定
// 実際の値を使用して設定を初期化
const azureConfig = {
  tenantId: tenantId.value(),
  endpoint: endpoint.value(),
  primaryKey: primaryKey.value(),
  secondaryKey: secondaryKey.value(),
  activeKey: activeKey.value(),
};

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
 * @return {Object} 生成されたトークン情報
 */
function generateAzureFluidToken(user, containerId = undefined) {
  const azureConfig = {
    tenantId: tenantId.value(),
    endpoint: endpoint.value(),
    primaryKey: primaryKey.value(),
    secondaryKey: secondaryKey.value(),
    activeKey: activeKey.value(),
  };
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

    const token = generateToken(
      azureConfig.tenantId, // テナントID
      keyToUse, // 署名キー
      [
        ScopeType.DocRead,
        ScopeType.DocWrite,
        ScopeType.SummaryWrite,
      ], // 権限スコープ
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
exports.fluidToken = onRequest((req, res) => {
  const azureConfig = {
    tenantId: tenantId.value(),
    endpoint: endpoint.value(),
    primaryKey: primaryKey.value(),
    secondaryKey: secondaryKey.value(),
    activeKey: activeKey.value(),
  };
  return cors(req, res, async () => {
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

      // ユーザーのコンテナ情報を取得
      const userDoc = await userContainersCollection.doc(userId).get();

      // ユーザーデータが存在しない場合のデフォルト値を設定
      const userData = userDoc.exists ?
        userDoc.data() :
        { accessibleContainerIds: [] };
      const accessibleContainerIds = userData.accessibleContainerIds || [];
      const defaultContainerId = userData.defaultContainerId || null;

      // 使用するコンテナIDを決定
      let targetContainerId = containerId;

      // コンテナIDが指定されていない場合はデフォルトを使用
      if (!targetContainerId && defaultContainerId) {
        logger.info(
          `No container ID specified, using default container: ` +
          `${defaultContainerId}`,
        );
        targetContainerId = defaultContainerId;
      }

      // コンテナIDが指定されている場合はアクセス権をチェック
      if (targetContainerId) {
        if (!accessibleContainerIds.includes(targetContainerId)) {
          return res.status(403).json({
            error: "Access to the container is denied",
          });
        }
      }

      // Azure Fluid RelayのJWT生成
      const jwt = generateAzureFluidToken({
        uid: userId,
        displayName:
          decodedToken.name ||
          decodedToken.displayName ||
          "Anonymous User",
      },
        targetContainerId);

      // レスポンスを返す
      return res.status(200).json({
        token: jwt.token,
        user: {
          id: userId,
          name: decodedToken.name ||
            decodedToken.displayName ||
            "Anonymous User",
        },
        tenantId: azureConfig.tenantId,
        containerId: targetContainerId,
        defaultContainerId,
        accessibleContainerIds,
      });
    } catch (error) {
      logger.error(`Token validation error: ${error.message}`, { error });
      return res.status(401).json({ error: "Authentication failed" });
    }
  });
});

// ユーザーのコンテナIDを保存するエンドポイント
exports.saveContainer = onRequest((req, res) => {
  return cors(req, res, async () => {
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
                admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(userDocRef, {
              userId,
              defaultContainerId: containerId,
              accessibleContainerIds: [containerId],
              createdAt:
                admin.firestore.FieldValue.serverTimestamp(),
              updatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
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
          } else {
            transaction.set(containerDocRef, {
              containerId,
              accessibleUserIds: [userId],
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
});

// ユーザーがアクセス可能なコンテナIDのリストを取得するエンドポイント
exports.getUserContainers = onRequest((req, res) => {
  return cors(req, res, async () => {
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
});

// ヘルスチェックエンドポイント
exports.health = onRequest((req, res) => {
  return cors(req, res, async () => {
    return res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
    });
  });
});
