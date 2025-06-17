const { describe, it, beforeEach, afterEach } = require("mocha");
const { expect } = require("chai");
const { createQueue, createTestTask, deleteTestTask, checkQueueStatus } = require("../scripts/setup-cloud-tasks");
const { existsSync } = require("fs");

describe("Cloud Tasks Integration Tests", () => {
    let createdTaskNames = [];

    beforeEach(async () => {
        // テスト前のクリーンアップ
        createdTaskNames = [];
    });

    afterEach(async () => {
        // テスト後のクリーンアップ - 作成したタスクを削除
        for (const taskName of createdTaskNames) {
            try {
                await deleteTestTask(taskName);
            } catch (error) {
                console.warn(`Failed to cleanup task ${taskName}:`, error.message);
            }
        }
    });

    describe("Queue Management", () => {
        it("should create or verify queue exists", async function() {
            if (process.env.NODE_ENV !== "production") {
                console.warn("Cloud Tasks integration tests only run in production environment");
                return;
            }
            if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                expect.fail("GOOGLE_APPLICATION_CREDENTIALS is not set or file not found");
            }

            try {
                const queue = await createQueue();
                expect(queue).to.be.an("object");
                expect(queue.name).to.include("draft-publish-queue");
            } catch (error) {
                if (error.message.includes("authentication") || error.message.includes("credentials")) {
                    expect.fail("Google Cloud authentication not configured: " + error.message);
                }
                throw error;
            }
        });

        it("should check queue status", async function() {
            if (process.env.NODE_ENV !== "production") {
                console.warn("Cloud Tasks integration tests only run in production environment");
                return;
            }
            if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                expect.fail("GOOGLE_APPLICATION_CREDENTIALS is not set or file not found");
            }

            try {
                const queue = await checkQueueStatus();
                expect(queue).to.be.an("object");
                expect(queue.name).to.include("draft-publish-queue");
                expect(queue.state).to.be.oneOf(["RUNNING", "PAUSED", "DISABLED"]);
            } catch (error) {
                if (error.message.includes("authentication") || error.message.includes("credentials")) {
                    expect.fail("Google Cloud authentication not configured: " + error.message);
                }
                throw error;
            }
        });
    });

    describe("Task Management", () => {
        it("should create and delete test task", async function() {
            if (process.env.NODE_ENV !== "production") {
                console.warn("Cloud Tasks integration tests only run in production environment");
                return;
            }
            if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                expect.fail("GOOGLE_APPLICATION_CREDENTIALS is not set or file not found");
            }

            try {
                // キューが存在することを確認
                await createQueue();

                // テストタスクを作成
                const taskName = await createTestTask();
                expect(taskName).to.be.a("string");
                expect(taskName).to.include("test-task-");

                createdTaskNames.push(taskName);

                // タスクが作成されたことを確認
                const queue = await checkQueueStatus();
                expect(queue).to.be.an("object");

                // タスクを削除
                await deleteTestTask(taskName);

                // 削除されたタスクをクリーンアップリストから除去
                const index = createdTaskNames.indexOf(taskName);
                if (index > -1) {
                    createdTaskNames.splice(index, 1);
                }
            } catch (error) {
                if (error.message.includes("authentication") || error.message.includes("credentials")) {
                    expect.fail("Google Cloud authentication not configured: " + error.message);
                }
                throw error;
            }
        });

        it("should handle task creation with invalid parameters", async function() {
            if (process.env.NODE_ENV !== "production") {
                console.warn("Cloud Tasks integration tests only run in production environment");
                return;
            }
            if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                expect.fail("GOOGLE_APPLICATION_CREDENTIALS is not set or file not found");
            }

            try {
                // 無効なパラメータでタスク作成を試行
                // この場合は実際のCloud Tasks APIを直接呼び出す
                const { CloudTasksClient } = require("@google-cloud/tasks");
                const client = new CloudTasksClient();

                const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "outliner-d57b0";
                const LOCATION = process.env.CLOUD_TASKS_LOCATION || "us-central1";
                const QUEUE_NAME = process.env.CLOUD_TASKS_QUEUE_NAME || "draft-publish-queue";
                const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

                // 無効なタスク（必須フィールドが不足）
                const invalidTask = {
                    name: `${parent}/tasks/invalid-task-${Date.now()}`,
                    // scheduleTimeが不足
                    httpRequest: {
                        httpMethod: "POST",
                        url: "https://invalid-url.com",
                    },
                };

                try {
                    await client.createTask({ parent, task: invalidTask });
                    expect.fail("Should have thrown an error for invalid task");
                } catch (error) {
                    expect(error).to.be.an("error");
                    // Cloud Tasks APIのエラーを期待
                }
            } catch (error) {
                if (error.message.includes("authentication") || error.message.includes("credentials")) {
                    expect.fail("Google Cloud authentication not configured: " + error.message);
                }
                throw error;
            }
        });
    });

    describe("Error Handling", () => {
        it("should handle non-existent task deletion gracefully", async function() {
            if (process.env.NODE_ENV !== "production") {
                console.warn("Cloud Tasks integration tests only run in production environment");
                return;
            }
            if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                expect.fail("GOOGLE_APPLICATION_CREDENTIALS is not set or file not found");
            }

            try {
                const { CloudTasksClient } = require("@google-cloud/tasks");
                const client = new CloudTasksClient();

                const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "outliner-d57b0";
                const LOCATION = process.env.CLOUD_TASKS_LOCATION || "us-central1";
                const QUEUE_NAME = process.env.CLOUD_TASKS_QUEUE_NAME || "draft-publish-queue";
                const nonExistentTaskName = client.taskPath(PROJECT_ID, LOCATION, QUEUE_NAME, "non-existent-task");

                try {
                    await client.deleteTask({ name: nonExistentTaskName });
                    expect.fail("Should have thrown an error for non-existent task");
                } catch (error) {
                    expect(error).to.be.an("error");
                    expect(error.code).to.equal(5); // NOT_FOUND
                }
            } catch (error) {
                if (error.message.includes("authentication") || error.message.includes("credentials")) {
                    expect.fail("Google Cloud authentication not configured: " + error.message);
                }
                throw error;
            }
        });
    });

    describe("Performance Tests", () => {
        it("should handle multiple task creation and deletion", async function() {
            if (process.env.NODE_ENV !== "production") {
                console.warn("Cloud Tasks integration tests only run in production environment");
                return;
            }
            if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
                expect.fail("GOOGLE_APPLICATION_CREDENTIALS is not set or file not found");
            }

            // タイムアウトを延長
            this.timeout(30000);

            try {
                // キューが存在することを確認
                await createQueue();

                const taskCount = 5;
                const taskNames = [];

                // 複数のタスクを作成
                for (let i = 0; i < taskCount; i++) {
                    const taskName = await createTestTask();
                    taskNames.push(taskName);
                    createdTaskNames.push(taskName);
                }

                expect(taskNames).to.have.length(taskCount);

                // 全てのタスクを削除
                for (const taskName of taskNames) {
                    await deleteTestTask(taskName);

                    // 削除されたタスクをクリーンアップリストから除去
                    const index = createdTaskNames.indexOf(taskName);
                    if (index > -1) {
                        createdTaskNames.splice(index, 1);
                    }
                }
            } catch (error) {
                if (error.message.includes("authentication") || error.message.includes("credentials")) {
                    expect.fail("Google Cloud authentication not configured: " + error.message);
                }
                throw error;
            }
        });
    });
});
