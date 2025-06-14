/**
 * 下書き公開機能
 */

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { createFluidClient, connectToContainer, writeToSharedTree } = require("./fluidService");

/**
 * 下書きを公開する
 * @param {Object} request 公開リクエスト
 * @returns {Promise<Object>} 公開結果
 */
async function publishDraft(request) {
  const { draftId, containerId, projectData, idToken } = request;

  logger.info("Publishing draft", { draftId, containerId });

  try {
    // Firebase IDトークンを検証
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    logger.info("User authenticated", { userId });

    // Fluid Frameworkクライアントを作成
    const { client } = await createFluidClient(userId, containerId);

    // コンテナに接続
    const { appData } = await connectToContainer(client, containerId);

    // SharedTreeにデータを書き込み
    await writeToSharedTree(appData, projectData);

    // 成功レスポンス
    const response = {
      success: true,
      containerId: containerId,
      publishedAt: new Date().toISOString()
    };

    logger.info("Draft published successfully", { draftId, containerId });
    return response;
  } catch (error) {
    logger.error("Failed to publish draft", {
      draftId,
      containerId,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 指定時刻に下書きを公開する（Cloud Tasks用）
 * @param {Object} taskPayload タスクペイロード
 * @returns {Promise<Object>} 公開結果
 */
async function publishDraftScheduled(taskPayload) {
  const { draftId, containerId, projectData, authorId } = taskPayload;

  logger.info("Publishing scheduled draft", { draftId, containerId, authorId });

  try {
    // Fluid Frameworkクライアントを作成
    const { client } = await createFluidClient(authorId, containerId);

    // コンテナに接続
    const { appData } = await connectToContainer(client, containerId);

    // SharedTreeにデータを書き込み
    await writeToSharedTree(appData, projectData);

    // 下書きメタデータを更新（Firestoreに保存されている場合）
    try {
      const db = admin.firestore();
      const draftRef = db.collection("drafts").doc(draftId);
      await draftRef.update({
        status: "published",
        publishedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      logger.info("Draft metadata updated in Firestore", { draftId });
    } catch (firestoreError) {
      logger.warn("Failed to update draft metadata in Firestore", {
        draftId,
        error: firestoreError.message
      });
      // Firestoreの更新失敗は致命的ではないので続行
    }

    const response = {
      success: true,
      containerId: containerId,
      publishedAt: new Date().toISOString()
    };

    logger.info("Scheduled draft published successfully", { draftId, containerId });
    return response;
  } catch (error) {
    logger.error("Failed to publish scheduled draft", {
      draftId,
      containerId,
      authorId,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cloud Tasksタスクを作成する
 * @param {Object} taskPayload タスクペイロード
 * @param {number} scheduleTime 実行予定時刻（Unix timestamp）
 * @returns {Promise<string>} 作成されたタスクの名前
 */
async function createScheduledPublishTask(taskPayload, scheduleTime) {
  const { CloudTasksClient } = require("@google-cloud/tasks");
  const client = new CloudTasksClient();

  const project = "outliner-d57b0"; // Firebase Functionsで自動設定
  const queue = "draft-publish-queue";
  const location = process.env.GOOGLE_CLOUD_REGION || "us-central1";
  const url = "https://outliner-d57b0.web.app/api/publish-draft-scheduled";

  const parent = client.queuePath(project, location, queue);

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url: url,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(JSON.stringify(taskPayload)).toString("base64"),
    },
    scheduleTime: {
      seconds: Math.floor(scheduleTime / 1000),
    },
  };

  logger.info("Creating scheduled task", {
    draftId: taskPayload.draftId,
    scheduleTime: new Date(scheduleTime).toISOString()
  });

  try {
    const [response] = await client.createTask({ parent, task });
    logger.info("Scheduled task created", {
      taskName: response.name,
      draftId: taskPayload.draftId
    });
    return response.name;
  } catch (error) {
    logger.error("Failed to create scheduled task", {
      draftId: taskPayload.draftId,
      error: error.message
    });
    throw error;
  }
}

/**
 * テスト用のダミー公開関数
 * @param {Object} request 公開リクエスト
 * @returns {Promise<Object>} 公開結果
 */
async function publishDraftTest(request) {
  const { draftId, containerId } = request;

  logger.info("Test publishing draft", { draftId, containerId });

  // テスト環境では実際の書き込みをスキップ
  await new Promise((resolve) => setTimeout(resolve, 1000)); // 1秒待機

  const response = {
    success: true,
    containerId: containerId,
    publishedAt: new Date().toISOString(),
    testMode: true
  };

  logger.info("Test draft published successfully", { draftId, containerId });
  return response;
}

module.exports = {
  publishDraft,
  publishDraftScheduled,
  createScheduledPublishTask,
  publishDraftTest,
};
