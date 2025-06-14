<script lang="ts">
import { onMount } from "svelte";
import SchedulePublishDialog from "../../../components/SchedulePublishDialog.svelte";
import ScheduleStatus from "../../../components/ScheduleStatus.svelte";

let isScheduleDialogOpen = $state(false);
let testDraftId = "test-draft-123";
let testContainerId = "test-container-456";
let testDraftTitle = "テスト下書き";

// テスト用のスケジュールデータ
let scheduleData = $state({
    taskId: "test-task-123",
    draftId: testDraftId,
    authorId: "test-user",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    scheduledAt: Date.now() + 3600000, // 1時間後
    status: "scheduled" as "scheduled" | "processing" | "published" | "failed" | "cancelled",
    retryCount: 0,
});

// テスト用のイベントフラグ
let editEventFired = $state(false);
let cancelEventFired = $state(false);

function openScheduleDialog() {
    isScheduleDialogOpen = true;
}

function handleScheduleDialogClose() {
    isScheduleDialogOpen = false;
}

function handleScheduled(event: { taskId: string; scheduledAt: number; }) {
    console.log("Schedule created:", event);
    // テスト用のスケジュールデータを更新
    scheduleData = {
        ...scheduleData,
        taskId: event.taskId,
        scheduledAt: event.scheduledAt,
        status: "scheduled" as const,
    };

    // グローバル変数も更新
    if (typeof window !== "undefined") {
        (window as any).__TEST_SCHEDULE_DATA__ = scheduleData;
    }
}

function handleScheduleEdit(event: { taskId: string; }) {
    console.log("Schedule edit requested:", event);
    editEventFired = true;
}

async function handleScheduleCancel(event: { taskId: string; }) {
    console.log("Schedule cancel requested:", event);

    // テスト環境でのキャンセル処理をシミュレート
    if (typeof window !== "undefined") {
        // キャンセル処理中の状態をシミュレート
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    cancelEventFired = true;
    // スケジュール状態をキャンセル済みに更新
    scheduleData = {
        ...scheduleData,
        status: "cancelled" as const,
    };
}

function handleScheduleRefresh() {
    console.log("Schedule refresh requested");
    // テスト用のデータ再読み込み
    scheduleData = { ...scheduleData };
}

function updateScheduleStatus(status: typeof scheduleData.status, retryCount?: number) {
    scheduleData = {
        ...scheduleData,
        status,
        retryCount: retryCount ?? scheduleData.retryCount,
    };

    // グローバル変数も更新
    if (typeof window !== "undefined") {
        (window as any).__TEST_SCHEDULE_DATA__ = scheduleData;
        (window as any).__TEST_SCHEDULE_STATUS__ = status;
        if (retryCount !== undefined) {
            (window as any).__TEST_RETRY_COUNT__ = retryCount;
        }
    }
}

// テスト用のグローバル変数を設定
onMount(() => {
    // テスト環境でのモックデータ設定
    if (typeof window !== "undefined") {
        (window as any).__TEST_SCHEDULE_DATA__ = scheduleData;
        (window as any).__TEST_DRAFT_ID__ = testDraftId;
        (window as any).__TEST_CONTAINER_ID__ = testContainerId;

        // URLパラメータからテスト設定を読み取り
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("compact") === "true") {
            (window as any).__TEST_COMPACT_MODE__ = true;
        }
        if (urlParams.get("loading") === "true") {
            (window as any).__TEST_LOADING_STATE__ = true;
        }

        // テスト環境でのデータ変更を監視
        const checkForUpdates = () => {
            const testScheduledTime = (window as any).__TEST_SCHEDULED_TIME__;
            const testStatus = (window as any).__TEST_SCHEDULE_STATUS__;
            const testRetryCount = (window as any).__TEST_RETRY_COUNT__;

            if (testScheduledTime || testStatus || testRetryCount !== undefined) {
                scheduleData = {
                    ...scheduleData,
                    scheduledAt: testScheduledTime || scheduleData.scheduledAt,
                    status: testStatus || scheduleData.status,
                    retryCount: testRetryCount !== undefined ? testRetryCount : scheduleData.retryCount,
                };
                (window as any).__TEST_SCHEDULE_DATA__ = scheduleData;
            }
        };

        // 定期的にチェック（テスト環境のみ）
        const interval = setInterval(checkForUpdates, 100);

        // クリーンアップ
        return () => clearInterval(interval);
    }
});
</script>

<svelte:head>
    <title>テストページ - スケジュール公開機能</title>
</svelte:head>

<div class="test-page">
    <h1>スケジュール公開機能テストページ</h1>

    <div class="test-section">
        <h2>スケジュール公開ダイアログ</h2>
        <p>下書き: {testDraftTitle}</p>
        <button
            data-testid="schedule-publish-button"
            onclick={openScheduleDialog}
            class="primary-button"
        >
            スケジュール公開
        </button>
    </div>

    <div class="test-section">
        <h2>スケジュール状態表示</h2>
        <div data-testid="schedule-status">
            <ScheduleStatus
                draftId={testDraftId}
                onedit={handleScheduleEdit}
                oncancel={handleScheduleCancel}
                onrefresh={handleScheduleRefresh}
            />
        </div>

        <div class="test-section">
            <h3>コンパクト表示</h3>
            <div data-testid="schedule-status-compact">
                <ScheduleStatus
                    draftId={testDraftId}
                    compact={typeof window !== "undefined" && (window as any).__TEST_COMPACT_MODE__ ? true
                    : true}
                    onedit={handleScheduleEdit}
                    oncancel={handleScheduleCancel}
                    onrefresh={handleScheduleRefresh}
                />
            </div>
        </div>
    </div>

    <div class="test-section">
        <h2>テスト用コントロール</h2>
        <div class="test-controls">
            <button onclick={() => updateScheduleStatus("scheduled")}>
                スケジュール済み状態
            </button>
            <button onclick={() => updateScheduleStatus("processing")}>
                実行中状態
            </button>
            <button onclick={() => updateScheduleStatus("published")}>
                完了状態
            </button>
            <button onclick={() => updateScheduleStatus("failed", 2)}>
                失敗状態
            </button>
            <button onclick={() => updateScheduleStatus("cancelled")}>
                キャンセル済み状態
            </button>
        </div>

        <div class="test-controls">
            <button data-testid="refresh-schedule" onclick={handleScheduleRefresh}>
                スケジュール更新
            </button>
        </div>
    </div>

    <div class="test-section">
        <h2>イベント状態</h2>
        <div class="event-indicators">
            {#if editEventFired}
                <div data-testid="edit-event-fired" class="event-indicator success">
                    編集イベントが発火されました
                </div>
            {/if}
            {#if cancelEventFired}
                <div data-testid="cancel-event-fired" class="event-indicator success">
                    キャンセルイベントが発火されました
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- スケジュール公開ダイアログ -->
<SchedulePublishDialog
    bind:isOpen={isScheduleDialogOpen}
    draftId={testDraftId}
    containerId={testContainerId}
    draftTitle={testDraftTitle}
    onclose={handleScheduleDialogClose}
    onscheduled={handleScheduled}
/>

<style>
.test-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.test-section {
    margin-bottom: 40px;
    padding: 20px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #f9fafb;
}

.test-section h2 {
    margin-top: 0;
    color: #374151;
}

.test-section h3 {
    color: #6b7280;
    margin-bottom: 10px;
}

.primary-button {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
}

.primary-button:hover {
    background: #2563eb;
}

.test-controls {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
}

.test-controls button {
    padding: 6px 12px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
}

.test-controls button:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
}

.event-indicators {
    margin-top: 10px;
}

.event-indicator {
    padding: 8px 12px;
    border-radius: 4px;
    margin-bottom: 8px;
    font-size: 14px;
}

.event-indicator.success {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #a7f3d0;
}

p {
    color: #6b7280;
    margin-bottom: 10px;
}
</style>
