/**
 * スケジュール公開管理サービス
 */

import { v4 as uuid } from "uuid";
import { userManager } from "../auth/UserManager";
import type {
    SchedulePublishOptions,
    SchedulePublishRequest,
    SchedulePublishResponse,
    ScheduleServiceInterface,
    ScheduleTaskMetadata,
} from "../types/schedule-types";
import { ScheduleStatus as Status } from "../types/schedule-types";
import { getLogger } from "./logger";

const logger = getLogger("scheduleService");

/**
 * スケジュール公開管理サービス
 */
class ScheduleService implements ScheduleServiceInterface {
    private schedules = new Map<string, ScheduleTaskMetadata>();

    /**
     * スケジュール公開を作成する
     */
    async createScheduledPublish(options: SchedulePublishOptions): Promise<ScheduleTaskMetadata> {
        const currentUser = userManager.getCurrentUser();

        // テスト環境でユーザーがログインしていない場合はテスト用のユーザーを使用
        let effectiveUser = currentUser;
        if (!effectiveUser) {
            const isTestEnvironment = import.meta.env.VITE_IS_TEST === "true" ||
                import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";

            if (isTestEnvironment) {
                effectiveUser = {
                    id: "test-user-id",
                    name: "Test User",
                    email: "test@example.com",
                };
                logger.info("Using test user for schedule creation in test environment");
            }
            else {
                throw new Error("ユーザーがログインしていません");
            }
        }

        const now = Date.now();
        const taskId = uuid();

        // スケジュールタスクのメタデータを作成
        const taskMetadata: ScheduleTaskMetadata = {
            taskId,
            draftId: options.draftId,
            authorId: effectiveUser.id,
            createdAt: now,
            updatedAt: now,
            scheduledAt: options.scheduledAt,
            status: Status.SCHEDULED,
            retryCount: 0,
        };

        try {
            // テスト環境でのエラーシミュレーション
            if (typeof window !== "undefined" && (window as any).__TEST_FORCE_ERROR__) {
                throw new Error("テスト用のエラーです");
            }

            // Cloud Tasksでタスクを作成
            const cloudTaskId = await this.createCloudTask(taskMetadata, options);
            taskMetadata.cloudTaskId = cloudTaskId;

            // メモリに保存
            this.schedules.set(taskId, taskMetadata);

            logger.info("Scheduled publish created", {
                taskId,
                draftId: options.draftId,
                scheduledAt: new Date(options.scheduledAt).toISOString(),
            });

            return taskMetadata;
        }
        catch (error) {
            logger.error("Failed to create scheduled publish", { taskId, error });
            throw error;
        }
    }

    /**
     * Cloud Tasksでタスクを作成する
     */
    private async createCloudTask(
        taskMetadata: ScheduleTaskMetadata,
        options: SchedulePublishOptions,
    ): Promise<string> {
        try {
            // Firebase Functionsのエンドポイント
            const functionsHost = import.meta.env.VITE_FIREBASE_FUNCTIONS_HOST || "localhost";
            const functionsPort = import.meta.env.VITE_FIREBASE_FUNCTIONS_PORT || "57070";
            const endpoint = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || `http://${functionsHost}:${functionsPort}`;
            const targetUrl = `${endpoint}/demo-test/us-central1/publishScheduledDraft`;

            // Firebase Authenticationのトークンを取得
            const firebaseUser = userManager.getFirebaseUser();
            let idToken = "test-token";

            if (firebaseUser) {
                idToken = await firebaseUser.getIdToken();
            }
            else {
                const isTestEnvironment = import.meta.env.VITE_IS_TEST === "true" ||
                    import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";

                if (!isTestEnvironment) {
                    throw new Error("Firebase認証ユーザーが見つかりません");
                }
                logger.info("Using test token for scheduled publish in test environment");
            }

            // Cloud Tasksのペイロードを作成
            const payload: SchedulePublishRequest = {
                draftId: options.draftId,
                containerId: options.containerId,
                idToken,
                taskMetadata,
            };

            // テスト環境では実際のCloud Tasksを使用せず、モックタスクIDを返す
            const isTestEnvironment = import.meta.env.VITE_IS_TEST === "true" ||
                import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";

            if (isTestEnvironment) {
                const mockTaskId = `test-task-${taskMetadata.taskId}`;
                logger.info("Created mock Cloud Task for test environment", {
                    mockTaskId,
                    targetUrl,
                    scheduledAt: new Date(options.scheduledAt).toISOString(),
                });
                return mockTaskId;
            }

            // 本番環境では実際のCloud Tasks APIを呼び出し
            const response = await fetch(`${endpoint}/demo-test/us-central1/createCloudTask`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    taskName: `publish-draft-${taskMetadata.taskId}`,
                    scheduleTime: options.scheduledAt,
                    targetUrl,
                    payload,
                    retryConfig: options.retryConfig,
                }),
            });

            if (!response.ok) {
                throw new Error(`Cloud Task creation failed: ${response.status}`);
            }

            const result = await response.json();
            return result.taskId;
        }
        catch (error) {
            logger.error("Failed to create Cloud Task", { error });
            throw error;
        }
    }

    /**
     * スケジュール公開をキャンセルする
     */
    async cancelScheduledPublish(taskId: string): Promise<boolean> {
        const schedule = this.schedules.get(taskId);
        if (!schedule) {
            throw new Error(`スケジュールが見つかりません: ${taskId}`);
        }

        if (schedule.status !== Status.SCHEDULED) {
            throw new Error(`キャンセルできない状態です: ${schedule.status}`);
        }

        try {
            // Cloud Tasksのタスクを削除
            if (schedule.cloudTaskId) {
                await this.deleteCloudTask(schedule.cloudTaskId);
            }

            // 状態を更新
            schedule.status = Status.CANCELLED;
            schedule.updatedAt = Date.now();

            logger.info("Scheduled publish cancelled", { taskId });
            return true;
        }
        catch (error) {
            logger.error("Failed to cancel scheduled publish", { taskId, error });
            throw error;
        }
    }

    /**
     * Cloud Tasksのタスクを削除する
     */
    private async deleteCloudTask(cloudTaskId: string): Promise<void> {
        const isTestEnvironment = import.meta.env.VITE_IS_TEST === "true" ||
            import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";

        if (isTestEnvironment) {
            logger.info("Deleted mock Cloud Task for test environment", { cloudTaskId });
            return;
        }

        // 本番環境では実際のCloud Tasks APIを呼び出し
        const functionsHost = import.meta.env.VITE_FIREBASE_FUNCTIONS_HOST || "localhost";
        const functionsPort = import.meta.env.VITE_FIREBASE_FUNCTIONS_PORT || "57070";
        const endpoint = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || `http://${functionsHost}:${functionsPort}`;
        const firebaseUser = userManager.getFirebaseUser();
        const idToken = firebaseUser ? await firebaseUser.getIdToken() : "test-token";

        const response = await fetch(`${endpoint}/demo-test/us-central1/deleteCloudTask`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify({ taskId: cloudTaskId }),
        });

        if (!response.ok) {
            throw new Error(`Cloud Task deletion failed: ${response.status}`);
        }
    }

    /**
     * スケジュール公開を更新する
     */
    async updateScheduledPublish(
        taskId: string,
        updates: Partial<SchedulePublishOptions>,
    ): Promise<ScheduleTaskMetadata> {
        const schedule = this.schedules.get(taskId);
        if (!schedule) {
            throw new Error(`スケジュールが見つかりません: ${taskId}`);
        }

        if (schedule.status !== Status.SCHEDULED) {
            throw new Error(`更新できない状態です: ${schedule.status}`);
        }

        try {
            // 既存のCloud Tasksタスクを削除
            if (schedule.cloudTaskId) {
                await this.deleteCloudTask(schedule.cloudTaskId);
            }

            // 新しいスケジュール時刻でタスクを再作成
            if (updates.scheduledAt) {
                const newOptions: SchedulePublishOptions = {
                    draftId: schedule.draftId,
                    containerId: updates.containerId || "", // 更新時にcontainerIdが指定されていない場合は空文字列
                    scheduledAt: updates.scheduledAt,
                    retryConfig: updates.retryConfig,
                    notificationConfig: updates.notificationConfig,
                };

                const newCloudTaskId = await this.createCloudTask(schedule, newOptions);
                schedule.cloudTaskId = newCloudTaskId;
                schedule.scheduledAt = updates.scheduledAt;
            }

            schedule.updatedAt = Date.now();

            logger.info("Scheduled publish updated", { taskId, updates });
            return schedule;
        }
        catch (error) {
            logger.error("Failed to update scheduled publish", { taskId, error });
            throw error;
        }
    }

    /**
     * スケジュール公開の状態を取得する
     */
    async getScheduleStatus(taskId: string): Promise<ScheduleTaskMetadata | undefined> {
        return this.schedules.get(taskId);
    }

    /**
     * 全てのスケジュール公開を取得する
     */
    async getAllSchedules(): Promise<ScheduleTaskMetadata[]> {
        return Array.from(this.schedules.values());
    }

    /**
     * 下書きのスケジュール公開を取得する
     */
    async getScheduleByDraftId(draftId: string): Promise<ScheduleTaskMetadata | undefined> {
        for (const schedule of this.schedules.values()) {
            if (schedule.draftId === draftId) {
                return schedule;
            }
        }
        return undefined;
    }

    /**
     * スケジュール公開の実行結果を更新する（Firebase Functionsから呼び出される）
     */
    updateScheduleResult(taskId: string, result: SchedulePublishResponse): void {
        const schedule = this.schedules.get(taskId);
        if (!schedule) {
            logger.warn("Schedule not found for result update", { taskId });
            return;
        }

        schedule.status = result.success ? Status.PUBLISHED : Status.FAILED;
        schedule.updatedAt = Date.now();
        schedule.lastExecutedAt = result.executedAt;

        if (result.success) {
            schedule.publishedAt = result.executedAt;
        }
        else {
            schedule.errorMessage = result.errorMessage;
            schedule.retryCount += 1;
        }

        logger.info("Schedule result updated", { taskId, success: result.success });
    }
}

// シングルトンインスタンスをエクスポート
export const scheduleService = new ScheduleService();

// テスト環境でのグローバル変数設定
if (typeof window !== "undefined") {
    (window as any).__SCHEDULE_SERVICE__ = scheduleService;
}
