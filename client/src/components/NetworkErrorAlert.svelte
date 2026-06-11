<script lang="ts">
interface Props {
    error?: string | null;
    retryCallback?: (() => void) | null;
}

let { error = $bindable(null), retryCallback = null }: Props = $props();

function dismiss() {
    error = null;
}
</script>

{#if error}
    <div class="network-error">
        <div class="error-icon">⚠️</div>
        <div class="error-content">
            <h3>サーバー接続エラー</h3>
            <p>{error}</p>
            <div class="error-actions">
                {#if retryCallback}
                    <button class="retry-btn" onclick={retryCallback}>再試行</button>
                {/if}
                <button class="dismiss-btn" onclick={dismiss}>閉じる</button>
            </div>
        </div>
    </div>
{/if}

<style>
.network-error {
    position: fixed;
    bottom: 20px;
    right: 20px;
    max-width: 400px;
    background-color: #fff;
    border-left: 4px solid #f44336;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    display: flex;
    border-radius: 4px;
    z-index: 1000;
    animation: slide-in 0.3s ease-out;
}

@keyframes slide-in {
    from {
        transform: translateX(100%);
    }
    to {
        transform: translateX(0);
    }
}

.error-icon {
    padding: 15px;
    font-size: 24px;
    display: flex;
    align-items: center;
}

.error-content {
    padding: 15px;
    flex: 1;
}

h3 {
    margin: 0 0 8px 0;
    color: #d32f2f;
    font-size: 18px;
}

p {
    margin: 0 0 15px 0;
    color: #444;
}

.error-actions {
    display: flex;
    gap: 10px;
}

button {
    padding: 6px 12px;
    border-radius: 4px;
    border: none;
    font-size: 14px;
    cursor: pointer;
}

.retry-btn {
    background-color: #2196f3;
    color: white;
}

.dismiss-btn {
    background-color: #f0f0f0;
    color: #333;
}
</style>
