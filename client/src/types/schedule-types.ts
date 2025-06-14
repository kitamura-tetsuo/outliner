/**
 * スケジュール公開機能の型定義
 */

/**
 * スケジュール公開の状態
 */
export enum ScheduleStatus {
    SCHEDULED = "scheduled",
    PROCESSING = "processing",
    PUBLISHED = "published",
    FAILED = "failed",
    CANCELLED = "cancelled",
}

/**
 * スケジュール公開のオプション
 */
export interface SchedulePublishOptions {
    /** 下書きID */
    draftId: string;
    /** コンテナID */
    containerId: string;
    /** 公開予定時刻（Unix timestamp） */
    scheduledAt: number;
    /** タイムゾーン（オプション、デフォルトはUTC） */
    timezone?: string;
    /** リトライ設定 */
    retryConfig?: RetryConfig;
    /** 通知設定 */
    notificationConfig?: NotificationConfig;
}

/**
 * リトライ設定
 */
export interface RetryConfig {
    /** 最大リトライ回数 */
    maxRetries: number;
    /** リトライ間隔（秒） */
    retryInterval: number;
    /** 指数バックオフを使用するか */
    useExponentialBackoff: boolean;
}

/**
 * 通知設定
 */
export interface NotificationConfig {
    /** 成功時に通知するか */
    notifyOnSuccess: boolean;
    /** 失敗時に通知するか */
    notifyOnFailure: boolean;
    /** 通知先メールアドレス */
    emailAddress?: string;
}

/**
 * スケジュールタスクのメタデータ
 */
export interface ScheduleTaskMetadata {
    /** タスクID */
    taskId: string;
    /** 下書きID */
    draftId: string;
    /** 作成者ID */
    authorId: string;
    /** 作成日時 */
    createdAt: number;
    /** 更新日時 */
    updatedAt: number;
    /** 公開予定時刻 */
    scheduledAt: number;
    /** 現在の状態 */
    status: ScheduleStatus;
    /** Cloud TasksのタスクID */
    cloudTaskId?: string;
    /** エラーメッセージ（失敗時） */
    errorMessage?: string;
    /** リトライ回数 */
    retryCount: number;
    /** 最後の実行時刻 */
    lastExecutedAt?: number;
    /** 公開完了時刻 */
    publishedAt?: number;
}

/**
 * スケジュール公開のリクエスト
 */
export interface SchedulePublishRequest {
    /** 下書きID */
    draftId: string;
    /** コンテナID */
    containerId: string;
    /** 認証トークン */
    idToken: string;
    /** タスクメタデータ */
    taskMetadata: ScheduleTaskMetadata;
}

/**
 * スケジュール公開のレスポンス
 */
export interface SchedulePublishResponse {
    /** 成功フラグ */
    success: boolean;
    /** タスクID */
    taskId: string;
    /** Cloud TasksのタスクID */
    cloudTaskId?: string;
    /** エラーメッセージ */
    errorMessage?: string;
    /** 実行時刻 */
    executedAt: number;
    /** 公開結果の詳細 */
    publishResult?: {
        /** マージ方法 */
        mergeMethod: string;
        /** 同期されたアイテム数 */
        syncedItemCount: number;
        /** マージ後のアイテム数 */
        totalItemCount: number;
    };
}

/**
 * Cloud Tasksタスクの作成オプション
 */
export interface CloudTaskCreateOptions {
    /** タスク名 */
    taskName: string;
    /** 実行予定時刻 */
    scheduleTime: number;
    /** HTTPリクエストのペイロード */
    payload: any;
    /** HTTPメソッド */
    httpMethod: "POST" | "GET" | "PUT" | "DELETE";
    /** ターゲットURL */
    targetUrl: string;
    /** ヘッダー */
    headers?: Record<string, string>;
    /** リトライ設定 */
    retryConfig?: RetryConfig;
}

/**
 * スケジュール管理サービスのインターフェース
 */
export interface ScheduleServiceInterface {
    /**
     * スケジュール公開を作成する
     */
    createScheduledPublish(options: SchedulePublishOptions): Promise<ScheduleTaskMetadata>;

    /**
     * スケジュール公開をキャンセルする
     */
    cancelScheduledPublish(taskId: string): Promise<boolean>;

    /**
     * スケジュール公開を更新する
     */
    updateScheduledPublish(taskId: string, updates: Partial<SchedulePublishOptions>): Promise<ScheduleTaskMetadata>;

    /**
     * スケジュール公開の状態を取得する
     */
    getScheduleStatus(taskId: string): Promise<ScheduleTaskMetadata | undefined>;

    /**
     * 全てのスケジュール公開を取得する
     */
    getAllSchedules(): Promise<ScheduleTaskMetadata[]>;

    /**
     * 下書きのスケジュール公開を取得する
     */
    getScheduleByDraftId(draftId: string): Promise<ScheduleTaskMetadata | undefined>;
}

/**
 * Cloud Tasksサービスのインターフェース
 */
export interface CloudTasksServiceInterface {
    /**
     * タスクを作成する
     */
    createTask(options: CloudTaskCreateOptions): Promise<string>;

    /**
     * タスクを削除する
     */
    deleteTask(taskId: string): Promise<boolean>;

    /**
     * タスクの状態を取得する
     */
    getTaskStatus(taskId: string): Promise<any>;
}
