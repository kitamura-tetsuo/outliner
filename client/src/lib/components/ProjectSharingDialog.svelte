<script lang="ts">
    import { userManager } from "../../auth/UserManager";
    import { togglePublic, getProjectPublicStatus } from "../../services/projectService";
    import { getLogger } from "../logger";

    interface Props {
        containerId: string;
        isOpen: boolean;
        onClose: () => void;
    }

    let { containerId, isOpen, onClose }: Props = $props();

    const logger = getLogger();

    // State
    let isPublic = $state(false);
    let publicAccessToken = $state<string | undefined>(undefined);
    let isLoading = $state(false);
    let error = $state("");
    let copySuccess = $state(false);

    // Current user info
    let currentUser = $derived(userManager.getCurrentUser());
    let currentUserId = $derived(currentUser?.id || "");

    // Public URL
    let publicUrl = $derived(
        isPublic && publicAccessToken
            ? `${window.location.origin}/projects/${containerId}?token=${publicAccessToken}`
            : ""
    );

    // Load public status when dialog opens
    $effect(() => {
        if (isOpen && containerId) {
            loadPublicStatus();
        }
    });

    async function loadPublicStatus() {
        isLoading = true;
        error = "";

        try {
            const status = await getProjectPublicStatus(containerId);
            if (status) {
                isPublic = status.isPublic;
                publicAccessToken = status.publicAccessToken;
            }
        } catch (e) {
            logger.error("Error loading public status:", e);
            error = "公開状態を取得できませんでした";
        } finally {
            isLoading = false;
        }
    }

    async function handleTogglePublic() {
        isLoading = true;
        error = "";

        try {
            const result = await togglePublic(containerId, !isPublic);
            if (result.success) {
                isPublic = !isPublic;
                if (isPublic && result.publicAccessToken) {
                    publicAccessToken = result.publicAccessToken;
                } else {
                    publicAccessToken = undefined;
                }
            } else {
                error = "公開状態の切り替えに失敗しました";
            }
        } catch (e) {
            logger.error("Error toggling public status:", e);
            error = "公開状態の切り替えに失敗しました";
        } finally {
            isLoading = false;
        }
    }

    async function copyToClipboard() {
        if (!publicUrl) return;

        try {
            await navigator.clipboard.writeText(publicUrl);
            copySuccess = true;
            setTimeout(() => {
                copySuccess = false;
            }, 2000);
        } catch (e) {
            logger.error("Failed to copy to clipboard:", e);
        }
    }

    function closeDialog() {
        onClose();
        error = "";
        copySuccess = false;
    }
</script>

{#if isOpen}
    <div class="dialog-overlay" onclick={closeDialog}>
        <div class="dialog" onclick={(e) => e.stopPropagation()}>
            <div class="dialog-header">
                <h2>公開設定</h2>
                <button class="close-button" onclick={closeDialog}>×</button>
            </div>

            <div class="dialog-content">
                {#if isLoading}
                    <div class="loading">読み込み中...</div>
                {:else}
                    {#if error}
                        <div class="error">{error}</div>
                    {/if}

                    <div class="toggle-section">
                        <div class="toggle-row">
                            <div class="toggle-info">
                                <h3>プロジェクトを一般公開</h3>
                                <p class="description">
                                    {#if isPublic}
                                        このプロジェクトは公開中です。リンク知道的任何人都可以查看。
                                    {:else}
                                        このプロジェクトは非公開です。所有者のみがアクセスできます。
                                    {/if}
                                </p>
                            </div>
                            <button
                                class="toggle-switch"
                                class:active={isPublic}
                                onclick={handleTogglePublic}
                                disabled={isLoading}
                            >
                                <span class="toggle-slider"></span>
                            </button>
                        </div>

                        {#if isPublic && publicUrl}
                            <div class="public-url-section">
                                <h4>公開URL</h4>
                                <div class="url-display">
                                    <input
                                        type="text"
                                        value={publicUrl}
                                        readonly
                                        class="url-input"
                                    />
                                    <button
                                        class="copy-button"
                                        class:success={copySuccess}
                                        onclick={copyToClipboard}
                                    >
                                        {copySuccess ? "コピー完了!" : "コピー"}
                                    </button>
                                </div>
                                <p class="warning">
                                    ⚠️ このURLを持つ人是誰でもこのプロジェクトを閲覧できます。共有する際は注意してください。
                                </p>
                            </div>
                        {/if}
                    {/if}
                </div>
            </div>

            <div class="dialog-footer">
                <button class="cancel-button" onclick={closeDialog}>
                    閉じる
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
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .dialog {
        background: white;
        border-radius: 8px;
        width: 90%;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid #e5e7eb;
    }

    .dialog-header h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
    }

    .close-button {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #6b7280;
        padding: 0;
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .close-button:hover {
        color: #374151;
    }

    .dialog-content {
        padding: 1.5rem;
    }

    .dialog-footer {
        padding: 1.5rem;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
    }

    .loading {
        text-align: center;
        padding: 2rem;
        color: #6b7280;
    }

    .error {
        background-color: #fee2e2;
        border: 1px solid #ef4444;
        color: #991b1b;
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 1rem;
    }

    .toggle-section {
        margin-bottom: 1.5rem;
    }

    .toggle-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .toggle-info h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1.125rem;
        font-weight: 600;
    }

    .description {
        margin: 0;
        color: #6b7280;
        font-size: 0.875rem;
    }

    .toggle-switch {
        position: relative;
        width: 3rem;
        height: 1.5rem;
        background-color: #d1d5db;
        border: none;
        border-radius: 9999px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .toggle-switch.active {
        background-color: #3b82f6;
    }

    .toggle-switch:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .toggle-slider {
        position: absolute;
        top: 0.125rem;
        left: 0.125rem;
        width: 1.25rem;
        height: 1.25rem;
        background-color: white;
        border-radius: 50%;
        transition: transform 0.2s;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .toggle-switch.active .toggle-slider {
        transform: translateX(1.5rem);
    }

    .public-url-section {
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 1rem;
        margin-top: 1rem;
    }

    .public-url-section h4 {
        margin: 0 0 0.75rem 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: #374151;
    }

    .url-display {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }

    .url-input {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 0.875rem;
        background-color: white;
    }

    .url-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .copy-button {
        padding: 0.5rem 1rem;
        background-color: #3b82f6;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 0.875rem;
        cursor: pointer;
        transition: background-color 0.2s;
        white-space: nowrap;
    }

    .copy-button:hover {
        background-color: #2563eb;
    }

    .copy-button.success {
        background-color: #10b981;
    }

    .warning {
        margin: 0;
        font-size: 0.75rem;
        color: #6b7280;
    }

    .cancel-button {
        padding: 0.5rem 1rem;
        background-color: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 0.875rem;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .cancel-button:hover {
        background-color: #e5e7eb;
    }
</style>
