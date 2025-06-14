/**
 * 下書き機能の型定義
 */

/**
 * 下書きのメタデータ
 */
export interface DraftMetadata {
    /** 下書きの一意識別子 */
    id: string;
    /** 下書きのタイトル */
    title: string;
    /** 作成者のユーザーID */
    authorId: string;
    /** 作成日時 */
    createdAt: number;
    /** 最終更新日時 */
    updatedAt: number;
    /** 元のコンテナID */
    sourceContainerId: string;
    /** 公開予定日時（未設定の場合はundefined） */
    scheduledPublishAt?: number;
    /** 下書きの状態 */
    status: DraftStatus;
}

/**
 * 下書きの状態
 */
export enum DraftStatus {
    /** 編集中 */
    EDITING = "editing",
    /** 公開予定 */
    SCHEDULED = "scheduled",
    /** 公開済み */
    PUBLISHED = "published",
    /** 削除済み */
    DELETED = "deleted",
}

/**
 * 下書きのデータ
 */
export interface DraftData {
    /** メタデータ */
    metadata: DraftMetadata;
    /** プロジェクトデータのスナップショット */
    projectSnapshot: any; // JSON形式のプロジェクトデータ
    /** 下書き用のプロジェクトデータ（編集可能） */
    draftProjectData: any; // JSON形式のプロジェクトデータ
    /** TreeBranch（fork機能使用時） */
    branch?: any;
    /** Fork（fork機能使用時） */
    fork?: any;
    /** 元のFluidClient（ブランチ機能使用時） */
    originalFluidClient?: any;
}

/**
 * 下書き作成のオプション
 */
export interface CreateDraftOptions {
    /** 下書きのタイトル */
    title: string;
    /** 公開予定日時（オプション） */
    scheduledPublishAt?: number;
}

/**
 * 下書き公開のオプション
 */
export interface PublishDraftOptions {
    /** 下書きID */
    draftId: string;
    /** 公開予定日時（即座に公開する場合は現在時刻） */
    publishAt?: number;
}

/**
 * Firebase Functionsに送信する下書き公開リクエスト
 */
export interface PublishDraftRequest {
    /** 下書きID */
    draftId: string;
    /** 対象コンテナID */
    containerId: string;
    /** 公開するプロジェクトデータ */
    projectData: any; // JSON形式
    /** 認証トークン */
    idToken: string;
}

/**
 * Firebase Functionsからの下書き公開レスポンス
 */
export interface PublishDraftResponse {
    /** 成功フラグ */
    success: boolean;
    /** エラーメッセージ（失敗時） */
    error?: string;
    /** 公開されたコンテナID */
    containerId?: string;
}

/**
 * Cloud Tasksのタスクペイロード
 */
export interface ScheduledPublishTaskPayload {
    /** 下書きID */
    draftId: string;
    /** 対象コンテナID */
    containerId: string;
    /** 公開するプロジェクトデータ */
    projectData: any; // JSON形式
    /** 作成者のユーザーID */
    authorId: string;
}
