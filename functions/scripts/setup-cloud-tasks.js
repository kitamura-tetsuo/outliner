#!/usr/bin/env node

/**
 * Cloud Tasksキューのセットアップスクリプト
 * 本番環境でのCloud Tasksキューの作成とテストを行う
 */

const { CloudTasksClient } = require("@google-cloud/tasks");

// 環境変数を読み込み
require("dotenv").config();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "outliner-d57b0";
const LOCATION = process.env.CLOUD_TASKS_LOCATION || "us-central1";
const QUEUE_NAME = process.env.CLOUD_TASKS_QUEUE_NAME || "draft-publish-queue";

/**
 * Cloud Tasksキューを作成する
 */
async function createQueue() {
    try {
        const client = new CloudTasksClient();
        const parent = client.locationPath(PROJECT_ID, LOCATION);
        const queuePath = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

        console.log(`Creating Cloud Tasks queue: ${QUEUE_NAME}`);
        console.log(`Project: ${PROJECT_ID}, Location: ${LOCATION}`);

        // キューが既に存在するかチェック
        try {
            const [existingQueue] = await client.getQueue({ name: queuePath });
            console.log(`Queue already exists: ${existingQueue.name}`);
            return existingQueue;
        } catch (error) {
            if (error.code !== 5) { // NOT_FOUND以外のエラーは再スロー
                throw error;
            }
            console.log("Queue does not exist, creating new queue...");
        }

        // キューを作成
        const queue = {
            name: queuePath,
            rateLimits: {
                maxDispatchesPerSecond: 10,
                maxBurstSize: 100,
                maxConcurrentDispatches: 10,
            },
            retryConfig: {
                maxAttempts: 3,
                maxRetryDuration: { seconds: 3600 }, // 1時間
                minBackoff: { seconds: 60 }, // 1分
                maxBackoff: { seconds: 3600 }, // 1時間
                maxDoublings: 5,
            },
        };

        const [createdQueue] = await client.createQueue({
            parent,
            queue,
        });

        console.log(`Queue created successfully: ${createdQueue.name}`);
        return createdQueue;
    } catch (error) {
        console.error("Failed to create queue:", error.message);
        throw error;
    }
}

/**
 * テスト用のCloud Tasksタスクを作成する
 */
async function createTestTask() {
    try {
        const client = new CloudTasksClient();
        const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

        const testTaskName = `test-task-${Date.now()}`;
        const scheduleTime = Date.now() + 60000; // 1分後に実行

        const task = {
            name: `${parent}/tasks/${testTaskName}`,
            scheduleTime: {
                seconds: Math.floor(scheduleTime / 1000),
            },
            httpRequest: {
                httpMethod: "POST",
                url: `https://${PROJECT_ID}.web.app/api/publishScheduledDraft`,
                headers: {
                    "Content-Type": "application/json",
                },
                body: Buffer.from(JSON.stringify({
                    draftId: "test-draft-id",
                    containerId: "test-container-id",
                    projectData: { title: "Test Project", items: [] },
                    authorId: "test-user-id",
                    taskMetadata: {
                        taskId: testTaskName,
                        createdAt: Date.now(),
                    },
                })),
            },
        };

        console.log(`Creating test task: ${testTaskName}`);
        console.log(`Scheduled for: ${new Date(scheduleTime).toISOString()}`);

        const [response] = await client.createTask({ parent, task });
        console.log(`Test task created successfully: ${response.name}`);

        return response.name;
    } catch (error) {
        console.error("Failed to create test task:", error.message);
        throw error;
    }
}

/**
 * Cloud Tasksタスクを削除する
 */
async function deleteTestTask(taskName) {
    try {
        const client = new CloudTasksClient();

        console.log(`Deleting test task: ${taskName}`);
        await client.deleteTask({ name: taskName });
        console.log("Test task deleted successfully");
    } catch (error) {
        console.error("Failed to delete test task:", error.message);
        throw error;
    }
}

/**
 * キューの状態を確認する
 */
async function checkQueueStatus() {
    try {
        const client = new CloudTasksClient();
        const queuePath = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

        const [queue] = await client.getQueue({ name: queuePath });
        console.log("Queue status:", {
            name: queue.name,
            state: queue.state,
            rateLimits: queue.rateLimits,
            retryConfig: queue.retryConfig,
        });

        // キュー内のタスク数を取得
        const [tasks] = await client.listTasks({ parent: queuePath });
        console.log(`Tasks in queue: ${tasks.length}`);

        return queue;
    } catch (error) {
        console.error("Failed to check queue status:", error.message);
        throw error;
    }
}

/**
 * メイン処理
 */
async function main() {
    try {
        console.log("=== Cloud Tasks Setup Script ===");
        console.log(`Project: ${PROJECT_ID}`);
        console.log(`Location: ${LOCATION}`);
        console.log(`Queue: ${QUEUE_NAME}`);
        console.log("");

        // 1. キューを作成
        await createQueue();
        console.log("");

        // 2. キューの状態を確認
        await checkQueueStatus();
        console.log("");

        // 3. テストタスクを作成
        const taskName = await createTestTask();
        console.log("");

        // 4. 少し待ってからタスクを削除
        console.log("Waiting 10 seconds before deleting test task...");
        await new Promise((resolve) => setTimeout(resolve, 10000));

        await deleteTestTask(taskName);
        console.log("");

        // 5. 最終的なキューの状態を確認
        await checkQueueStatus();

        console.log("=== Setup completed successfully ===");
    } catch (error) {
        console.error("Setup failed:", error.message);
        process.exit(1);
    }
}

// スクリプトが直接実行された場合のみメイン処理を実行
if (require.main === module) {
    main();
}

module.exports = {
    createQueue,
    createTestTask,
    deleteTestTask,
    checkQueueStatus,
};
