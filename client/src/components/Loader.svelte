<script lang="ts">
    interface Props {
        message?: string;
    }

    let { message }: Props = $props();
</script>

{#if message}
    <div class="flex flex-col items-center justify-center space-y-4" aria-busy="true" aria-live="polite" role="status">
        <div class="loader" aria-hidden="true"></div>
        <div class="text-gray-600 text-sm font-medium">{message}</div>
    </div>
{:else}
    <div class="loader" aria-hidden="true" aria-busy="true" aria-live="polite" role="status"></div>
{/if}

<style>
    .loader {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin: 0 auto;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>
