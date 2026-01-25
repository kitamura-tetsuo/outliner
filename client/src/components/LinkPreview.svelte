<script lang="ts">
import {
    getPreviewContent,
    type PreviewContent,
} from "../services/linkPreviewService";
import { getLogger } from "$lib/logger";
import {
    onDestroy,
    onMount,
} from "svelte";

const logger = getLogger("LinkPreview");

interface Props {
    targetId: string;
    targetName: string;
}

let { targetId, targetName }: Props = $props();

let isVisible = $state(false);
let isLoading = $state(false);
let previewContent = $state<PreviewContent | null>(null);
let error = $state<string | null>(null);
let timer: ReturnType<typeof setTimeout>;
let previewElement: HTMLDivElement | undefined = $state();
let previewPosition = $state({ top: 0, left: 0 });

function showPreview(event: MouseEvent) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    previewPosition = {
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX
    };

    timer = setTimeout(() => {
        isVisible = true;
        loadPreview();
    }, 500);
}

function hidePreview() {
    clearTimeout(timer);
    isVisible = false;
}

async function loadPreview() {
    if (previewContent) return;

    isLoading = true;
    error = null;

    try {
        logger.info(`Loading preview for: ${targetName} (${targetId})`);
        previewContent = await getPreviewContent(targetId, targetName);
    }
    catch (err) {
        logger.error("Failed to load preview:", err);
        error = "Failed to load preview";
    }
    finally {
        isLoading = false;
    }
}

onMount(() => {
    // Check if we need to adjust position to keep it within viewport
    if (isVisible && previewElement) {
        const rect = previewElement.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            previewPosition.left = window.innerWidth - rect.width - 20;
        }
        if (rect.bottom > window.innerHeight) {
            previewPosition.top = (previewPosition.top - rect.height - 40);
        }
    }
});

onDestroy(() => {
    // Cleanup processing
});
</script>

<div
    class="link-preview-trigger"
    role="tooltip"
    onmouseenter={showPreview}
    onmouseleave={hidePreview}
>
    <slot></slot>

    {#if isVisible}
        <div
            bind:this={previewElement}
            class="link-preview-popup"
            style="top: {previewPosition.top}px; left: {previewPosition.left}px;"
        >
            {#if isLoading}
                <div class="preview-loading">
                    <div class="loader"></div>
                    <p>Loading...</p>
                </div>
            {:else if error}
                <div class="preview-error">
                    <p>{error}</p>
                </div>
            {:else if previewContent}
                <div class="preview-content">
                    <h3 class="preview-title">{previewContent.text}</h3>
                    <div class="preview-items">
                        {#if previewContent && previewContent.items && (previewContent.items as any).length > 0}
                            <ul>
                                {#each Array.from({ length: Math.min(5, (previewContent.items as any).length) }, (_, i) => (previewContent.items as any)[i]) as item (item.id)}
                                    <li>{item.text}</li>
                                {/each}

                                {#if (previewContent.items as any).length > 5}
                                    <li class="more-items">...</li>
                                {/if}
                            </ul>
                        {:else}
                            <p class="empty-page">This page has no content</p>
                        {/if}
                    </div>
                </div>
            {:else}
                <div class="preview-not-found">
                    <p>Page not found</p>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
.link-preview-trigger {
    position: relative;
    display: inline-block;
}

.link-preview-popup {
    position: absolute;
    z-index: 1000;
    width: 300px;
    max-height: 300px;
    background-color: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 12px;
    overflow: hidden;
    font-size: 14px;
}

.preview-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 8px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid #eee;
    color: #333;
}

.preview-items {
    max-height: 220px;
    overflow-y: auto;
}

.preview-items ul {
    margin: 0;
    padding: 0 0 0 20px;
}

.preview-items li {
    margin-bottom: 4px;
    color: #555;
    line-height: 1.4;
}

.more-items {
    color: #888;
    font-style: italic;
}

.empty-page {
    color: #888;
    font-style: italic;
    margin: 10px 0;
}

.preview-loading, .preview-error, .preview-not-found {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100px;
    color: #666;
}

.preview-error, .preview-not-found {
    color: #d32f2f;
}

.loader {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #3498db;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>
