<script lang="ts">
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import {
    type Backlink,
    collectBacklinks,
} from "$lib/backlinkCollector";
import { getLogger } from "$lib/logger";
import {
    onDestroy,
    onMount,
} from "svelte";
import { highlightLinkInContext } from "../utils/linkHighlighter";

const logger = getLogger("BacklinkPanel");

interface Props {
    pageName: string;
    projectName?: string;
}

let { pageName, projectName }: Props = $props();

// Backlink information
let backlinks = $state<Backlink[]>([]);
let isLoading = $state(false);
let isOpen = $state(false);
let error = $state<string | null>(null);

// Load backlinks
async function loadBacklinks() {
    if (!pageName) return;

    isLoading = true;
    error = null;

    try {
        // Collect backlinks
        backlinks = collectBacklinks(pageName);
        logger.info(`Loaded ${backlinks.length} backlinks for page: ${pageName}`);
    }
    catch (err) {
        logger.error("Failed to load backlinks:", err);
        error = "Failed to load backlinks";
        backlinks = [];
    }
    finally {
        isLoading = false;
    }
}

// Toggle panel visibility
function togglePanel() {
    isOpen = !isOpen;

    if (isOpen && backlinks.length === 0) {
        loadBacklinks();
    }
}

// Navigate to source page
async function navigateToPage(_pageId: string, pageName: string) {
    if (!projectName) {
        // Use current project if not specified
        await goto(resolve(`/${pageName}`));
    }
    else {
        await goto(resolve(`/${projectName}/${pageName}`));
    }
}

// Reload backlinks
function refreshBacklinks() {
    loadBacklinks();
}

// Component lifecycle
onMount(() => {
    // Start collapsed
    isOpen = false;
});

onDestroy(() => {
    // Cleanup
});

</script>

<div class="backlink-panel">
    <button
        onclick={togglePanel}
        class="backlink-toggle-button"
        class:active={isOpen}
        aria-expanded={isOpen}
        aria-controls="backlink-content-panel"
    >
        <span class="backlink-count">{backlinks.length}</span>
        <span class="backlink-label">Backlinks</span>
        <svg
            class="chevron-icon"
            class:collapsed={!isOpen}
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    </button>

    {#if isOpen}
        <div
            id="backlink-content-panel"
            class="backlink-content"
            role="region"
            aria-label="Backlinks"
        >
            <div class="backlink-header">
                <h3>Backlinks</h3>
                <button
                    onclick={refreshBacklinks}
                    class="refresh-button"
                    title="Refresh"
                    aria-label="Refresh backlinks"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 4v6h-6"></path>
                        <path d="M1 20v-6h6"></path>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                </button>
            </div>

            {#if isLoading}
                <div class="backlink-loading" role="status" aria-live="polite">
                    <div class="loader"></div>
                    <p>Loading...</p>
                </div>
            {:else if error}
                <div class="backlink-error" role="status" aria-live="polite">
                    <p>{error}</p>
                </div>
            {:else if backlinks.length === 0}
                <div class="backlink-empty" role="status">
                    <p>No backlinks found for this page.</p>
                </div>
            {:else}
                <ul class="backlink-list">
                    {#each backlinks as backlink (`${backlink.sourcePageId}-${backlink.context}`)}
                        <li class="backlink-item">
                            <div class="backlink-source">
                                <button
                                    type="button"
                                    onclick={() => navigateToPage(backlink.sourcePageId, backlink.sourcePageName)}
                                    class="source-page-link"
                                >
                                    {backlink.sourcePageName}
                                </button>
                            </div>
                            <div class="backlink-context">
                                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                {@html highlightLinkInContext(backlink.context, pageName)}
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}
</div>

<style>
.backlink-panel {
    margin-top: 20px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    overflow: hidden;
}

.backlink-toggle-button {
    width: 100%;
    display: flex;
    align-items: center;
    padding: 10px 15px;
    background-color: #f5f5f5;
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
}

.backlink-toggle-button:hover {
    background-color: #e8e8e8;
}

.backlink-toggle-button.active {
    background-color: #e0e0e0;
}

.backlink-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    background-color: #0078d7;
    color: white;
    border-radius: 12px;
    font-size: 12px;
    margin-right: 10px;
    padding: 0 6px;
}

.backlink-label {
    flex: 1;
    font-weight: 500;
}

.chevron-icon {
    transition: transform 0.2s ease;
    transform: rotate(0deg); /* Expanded state (down) */
    color: #666;
}

.chevron-icon.collapsed {
    transform: rotate(-90deg); /* Collapsed state (right) */
}

.backlink-content {
    padding: 15px;
    background-color: white;
    max-height: 400px;
    overflow-y: auto;
}

.backlink-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.backlink-header h3 {
    margin: 0;
    font-size: 16px;
    color: #333;
}

.refresh-button {
    background: none;
    border: none;
    color: #0078d7;
    cursor: pointer;
    font-size: 16px;
    padding: 4px 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.refresh-button:hover {
    background-color: #f0f0f0;
}

.backlink-loading,
.backlink-error,
.backlink-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100px;
    color: #666;
}

.backlink-error {
    color: #d32f2f;
}

.loader {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #0078d7;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

.backlink-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.backlink-item {
    padding: 10px;
    border-bottom: 1px solid #eee;
}

.backlink-item:last-child {
    border-bottom: none;
}

.backlink-source {
    margin-bottom: 5px;
}

.source-page-link {
    color: #0078d7;
    text-decoration: none;
    font-weight: 500;
}

.source-page-link:hover {
    text-decoration: underline;
}

.backlink-context {
    font-size: 13px;
    color: #666;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
}

:global(.highlight) {
    background-color: #fff3cd;
    padding: 0 2px;
    border-radius: 2px;
}
</style>
