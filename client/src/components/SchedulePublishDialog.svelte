<script lang="ts">
// import { createEventDispatcher } from "svelte";
import { getLogger } from "../lib/logger";
import { scheduleService } from "../lib/scheduleService.svelte";
import type { SchedulePublishOptions } from "../types/schedule-types";

const logger = getLogger("SchedulePublishDialog");

interface Props {
    isOpen?: boolean;
    draftId: string;
    containerId: string;
    draftTitle?: string;
    editingTaskId?: string;
    onclose?: () => void;
    onscheduled?: (event: { taskId: string; scheduledAt: number; }) => void;
}

const { isOpen = $bindable(false), draftId, containerId, draftTitle = "", editingTaskId, onclose, onscheduled }: Props =
    $props();

let scheduledDate = $state("");
let scheduledTime = $state("");
let isScheduling = $state(false);
let errorMessage = $state("");
let retryEnabled = $state(true);
let maxRetries = $state(3);
let retryDelayMinutes = $state(5);

// 現在時刻から1時間後をデフォルトに設定
function setDefaultDateTime() {
    const now = new Date();
    now.setHours(now.getHours() + 1);

    scheduledDate = now.toISOString().split("T")[0];
    scheduledTime = now.toTimeString().slice(0, 5);
}

// ダイアログが開かれた時にデフォルト値を設定
$effect(() => {
    if (isOpen && !scheduledDate) {
        setDefaultDateTime();
    }
});

// 入力値の検証
const isValidDateTime = $derived(
    scheduledDate && scheduledTime &&
        new Date(`${scheduledDate}T${scheduledTime}`).getTime() > Date.now(),
);

async function handleSchedule() {
    if (!isValidDateTime) {
        errorMessage = "有効な日時を入力してください（現在時刻より後の時刻）";
        return;
    }

    isScheduling = true;
    errorMessage = "";

    try {
        const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).getTime();

        const options: SchedulePublishOptions = {
            draftId,
            containerId,
            scheduledAt,
            retryConfig: retryEnabled ? {
                maxRetries,
                retryInterval: retryDelayMinutes * 60,
                useExponentialBackoff: true,
            } : undefined,
        };

        const taskMetadata = await scheduleService.createScheduledPublish(options);

        logger.info("Scheduled publish created successfully", {
            taskId: taskMetadata.taskId,
            draftId,
            scheduledAt: new Date(scheduledAt).toISOString(),
        });

        onscheduled?.({
            taskId: taskMetadata.taskId,
            scheduledAt,
        });

        handleClose();
    }
    catch (error) {
        logger.error("Failed to schedule publish", { draftId, error });
        errorMessage = error instanceof Error ? error.message : "スケジュール作成に失敗しました";
    }
    finally {
        isScheduling = false;
    }
}

function handleClose() {
    scheduledDate = "";
    scheduledTime = "";
    errorMessage = "";
    retryEnabled = true;
    maxRetries = 3;
    retryDelayMinutes = 5;
    onclose?.();
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        handleClose();
    }
}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
    <div class="dialog-overlay" onclick={handleClose} role="presentation">
        <div
            class="dialog"
            onclick={e => e.stopPropagation()}
            role="dialog"
            aria-labelledby="dialog-title"
            tabindex="-1"
        >
            <div class="dialog-header">
                <h2 id="dialog-title">スケジュール公開</h2>
                <button class="close-button" onclick={handleClose} aria-label="閉じる">
                    ×
                </button>
            </div>

            <div class="dialog-content">
                <div class="draft-info">
                    <p><strong>下書き:</strong> {draftTitle || draftId}</p>
                </div>

                <div class="form-group">
                    <label for="scheduled-date">公開日:</label>
                    <input
                        id="scheduled-date"
                        type="date"
                        bind:value={scheduledDate}
                        min={new Date().toISOString().split("T")[0]}
                        required
                    />
                </div>

                <div class="form-group">
                    <label for="scheduled-time">公開時刻:</label>
                    <input
                        id="scheduled-time"
                        type="time"
                        bind:value={scheduledTime}
                        required
                    />
                </div>

                <div class="form-group">
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={retryEnabled}
                        />
                        失敗時のリトライを有効にする
                    </label>
                </div>

                {#if retryEnabled}
                    <div class="retry-config">
                        <div class="form-group">
                            <label for="max-retries">最大リトライ回数:</label>
                            <input
                                id="max-retries"
                                type="number"
                                bind:value={maxRetries}
                                min="1"
                                max="10"
                            />
                        </div>

                        <div class="form-group">
                            <label for="retry-delay">リトライ間隔（分）:</label>
                            <input
                                id="retry-delay"
                                type="number"
                                bind:value={retryDelayMinutes}
                                min="1"
                                max="60"
                            />
                        </div>
                    </div>
                {/if}

                {#if errorMessage}
                    <div class="error-message">
                        {errorMessage}
                    </div>
                {/if}
            </div>

            <div class="dialog-actions">
                <button class="cancel-button" onclick={handleClose} disabled={isScheduling}>
                    キャンセル
                </button>
                <button
                    class="schedule-button"
                    onclick={handleSchedule}
                    disabled={!isValidDateTime || isScheduling}
                >
                    {#if isScheduling}
                        スケジュール中...
                    {:else}
                        スケジュール
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
.dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.dialog {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px 16px;
    border-bottom: 1px solid #e5e7eb;
}

.dialog-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
}

.close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
    padding: 4px;
    line-height: 1;
}

.close-button:hover {
    color: #374151;
}

.dialog-content {
    padding: 20px 24px;
}

.draft-info {
    margin-bottom: 20px;
    padding: 12px;
    background: #f9fafb;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
}

.draft-info p {
    margin: 0;
    color: #374151;
}

.form-group {
    margin-bottom: 16px;
}

.form-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #374151;
}

.form-group input[type="date"],
.form-group input[type="time"],
.form-group input[type="number"] {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
}

.form-group input[type="checkbox"] {
    margin-right: 8px;
}

.retry-config {
    margin-left: 24px;
    padding-left: 16px;
    border-left: 2px solid #e5e7eb;
}

.error-message {
    margin-top: 16px;
    padding: 12px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #dc2626;
    font-size: 14px;
}

.dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px 20px;
    border-top: 1px solid #e5e7eb;
}

.cancel-button,
.schedule-button {
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.cancel-button {
    background: white;
    border: 1px solid #d1d5db;
    color: #374151;
}

.cancel-button:hover:not(:disabled) {
    background: #f9fafb;
}

.schedule-button {
    background: #3b82f6;
    border: 1px solid #3b82f6;
    color: white;
}

.schedule-button:hover:not(:disabled) {
    background: #2563eb;
}

.schedule-button:disabled,
.cancel-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
