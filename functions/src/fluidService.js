/**
 * Firebase FunctionsからFluid Frameworkにアクセスするためのサービス
 */

const { generateToken } = require("@fluidframework/azure-service-utils");
const { ScopeType } = require("@fluidframework/azure-client");
const { AzureClient } = require("@fluidframework/azure-client");
const { TinyliciousClient } = require("@fluidframework/tinylicious-client");
const { SharedTree } = require("@fluidframework/tree");
const logger = require("firebase-functions/logger");

// 環境変数を読み込み
require("dotenv").config();

// Azure設定
const azureConfig = {
  tenantId: process.env.AZURE_TENANT_ID,
  endpoint: process.env.AZURE_ENDPOINT,
  primaryKey: process.env.AZURE_PRIMARY_KEY,
  secondaryKey: process.env.AZURE_SECONDARY_KEY,
  activeKey: process.env.AZURE_ACTIVE_KEY,
};

// コンテナスキーマ
const containerSchema = {
  initialObjects: {
    appData: SharedTree,
  },
};

/**
 * Fluid Frameworkクライアントを作成する
 * @param {string} userId ユーザーID
 * @param {string} containerId コンテナID
 * @returns {Promise<Object>} Fluid Frameworkクライアント
 */
async function createFluidClient(userId, containerId) {
  logger.info(`Creating Fluid client for user: ${userId}, container: ${containerId}`);

  // 開発環境ではTinyliciousを使用
  const useTinylicious = process.env.NODE_ENV !== "production";

  if (useTinylicious) {
    logger.info("Using Tinylicious client for development");
    const client = new TinyliciousClient();
    return { client, isAzure: false };
  }

  // プロダクション環境ではAzure Fluid Relayを使用
  logger.info("Using Azure Fluid Relay client for production");

  // Azure Fluid RelayのJWTトークンを生成
  const keyToUse = azureConfig.activeKey === "primary" ?
    azureConfig.primaryKey : azureConfig.secondaryKey;

  const fluidUser = {
    id: userId,
    name: "Firebase Function",
  };

  const token = generateToken(
    azureConfig.tenantId,
    keyToUse,
    [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
    containerId,
    fluidUser
  );

  const client = new AzureClient({
    connection: {
      tenantId: azureConfig.tenantId,
      tokenProvider: {
        fetchOrdererToken: () => Promise.resolve(token),
        fetchStorageToken: () => Promise.resolve(token),
      },
      endpoint: azureConfig.endpoint,
    },
  });

  return { client, isAzure: true };
}

/**
 * Fluid Frameworkコンテナに接続する
 * @param {Object} client Fluid Frameworkクライアント
 * @param {string} containerId コンテナID
 * @returns {Promise<Object>} コンテナとappData
 */
async function connectToContainer(client, containerId) {
  logger.info(`Connecting to container: ${containerId}`);

  try {
    const { container } = await client.getContainer(containerId, containerSchema, "2");
    const appData = container.initialObjects.appData;

    logger.info("Successfully connected to container");
    return { container, appData };
  } catch (error) {
    logger.error("Failed to connect to container", { error: error.message });
    throw new Error(`コンテナへの接続に失敗しました: ${error.message}`);
  }
}

/**
 * SharedTreeにデータを書き込む
 * @param {Object} appData SharedTreeオブジェクト
 * @param {Object} projectData 書き込むプロジェクトデータ
 * @returns {Promise<void>}
 */
async function writeToSharedTree(appData, projectData) {
  logger.info("Writing data to SharedTree");

  try {
    // SharedTreeに直接データを設定
    // Fluid Framework v2.41.0では、SharedTreeは直接JSONライクなデータを扱える

    // 現在のデータを取得
    const currentData = appData.root || {};

    // プロジェクトデータをマージ
    const updatedData = {
      ...currentData,
      title: projectData.title || currentData.title || "Untitled",
      items: projectData.items || currentData.items || [],
      created: projectData.created || currentData.created || Date.now(),
      lastModified: Date.now()
    };

    // SharedTreeのルートを更新
    if (typeof appData.initialize === "function" && !appData.root) {
      logger.info("Initializing SharedTree with project data");
      appData.initialize(updatedData);
    } else {
      logger.info("Updating existing SharedTree data");
      // 既存データを更新
      Object.assign(appData.root, updatedData);
    }

    logger.info("Successfully wrote data to SharedTree");
  } catch (error) {
    logger.error("Failed to write to SharedTree", { error: error.message });
    throw new Error(`SharedTreeへの書き込みに失敗しました: ${error.message}`);
  }
}

/**
 * SharedTreeからデータを読み取る
 * @param {Object} appData SharedTreeオブジェクト
 * @returns {Promise<Object>} 読み取ったデータ
 */
async function readFromSharedTree(appData) {
  logger.info("Reading data from SharedTree");

  try {
    // SharedTreeから直接データを読み取り
    const root = appData.root;

    if (!root) {
      logger.info("SharedTree is not initialized");
      return null;
    }

    // データを抽出
    const data = {
      title: root.title || "Untitled",
      items: root.items || [],
      created: root.created || Date.now(),
      lastModified: root.lastModified || Date.now()
    };

    logger.info("Successfully read data from SharedTree", {
      itemCount: Array.isArray(data.items) ? data.items.length : 0
    });
    return data;
  } catch (error) {
    logger.error("Failed to read from SharedTree", { error: error.message });
    throw new Error(`SharedTreeからの読み取りに失敗しました: ${error.message}`);
  }
}

module.exports = {
  createFluidClient,
  connectToContainer,
  writeToSharedTree,
  readFromSharedTree,
  containerSchema,
};
