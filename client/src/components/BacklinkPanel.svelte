<script lang="ts">
import { goto } from "$app/navigation";
import { resolvePath } from "../utils/pathUtils";
import {
    collectBacklinks,
    getHighlightSegments,
} from "$lib/backlinkCollector";
import { getLogger } from "$lib/logger";
import { yjsStore } from "../stores/yjsStore.svelte";
import { store } from "../stores/store.svelte";
import {
    onDestroy,
    onMount,
} from "svelte";

const logger = getLogger("BacklinkPanel");

interface Props {
    pageName: string;
    projectName?: string;
}

let { pageName, projectName }: Props = $props();

// Backlink information
let hasLoaded = $derived.by(() => {
    void store.pagesVersion;
    return !!store.pages?.current;
});

let debouncedPagesVersion = $state(0);
$effect(() => {
    const v = store.pagesVersion;
    const handler = setTimeout(() => {
        debouncedPagesVersion = v;
    }, 500);
    return () => clearTimeout(handler);
});

let backlinks = $derived.by(() => {
    void debouncedPagesVersion;
    if (!pageName || !hasLoaded || yjsStore.notYetSynced) return [];

    try {
        return collectBacklinks(pageName);
    }
    catch (err) {
        logger.error({ error: err }, "Failed to load backlinks");
        return [];
    }
});

let isOpen = $state(false);



// Toggle panel visibility
function togglePanel() {
    isOpen = !isOpen;
}

// Navigate to the linked page
function navigateToPage(_pageId: string, pageName: string) {
    if (!projectName) {
        // If no project name is specified, use the current project
        goto(resolvePath(`/${encodeURIComponent(pageName)}`));
    }
    else {
        goto(resolvePath(`/${projectName === 'demo' ? 'demo' : encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`));
    }
}



// Handle component mount
onMount(() => {
    // Keep closed by default
    isOpen = false;
});

// Handle component destruction
onDestroy(() => {
    // Cleanup
});


</script>

<div class="backlink-panel">
    <button type="button"
        onclick={togglePanel}
        class="backlink-toggle-button"
        class:active={isOpen}
    >
        <span class="backlink-count">{hasLoaded ? backlinks.length : '-'}</span>
        <span class="backlink-label">Backlinks</span>
        <span class="toggle-icon">{isOpen ? "▼" : "▶"}</span>
    </button>

    {#if isOpen}
        <div class="backlink-content">
            <div class="backlink-header">
                <h3>Backlinks</h3>

            </div>

            {#if !hasLoaded}
                <div class="backlink-loading">
                    <div class="loader"></div>
                    <p>Loading...</p>
                </div>
            {:else if backlinks.length === 0}
                <div class="backlink-empty">
                    <p>No links to this page</p>
                </div>
            {:else}
                <ul class="backlink-list">
                    {#each backlinks as backlink (`${backlink.sourcePageId}-${backlink.context}`)}
                        <li class="backlink-item">
                            <div class="backlink-source">
                                <button type="button"
                                    onclick={() => navigateToPage(backlink.sourcePageId, backlink.sourcePageName)}
                                    class="source-page-link"
                                >
                                    {backlink.sourcePageName}
                                </button>
                            </div>
                            <div class="backlink-context">
                                {#each getHighlightSegments(backlink.context, pageName) as segment, index (index)}
                                    {#if segment.type === 'highlight'}
                                        <span class="highlight">{segment.text}</span>
                                    {:else}
                                        {segment.text}
                                    {/if}
                                {/each}
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

.toggle-icon {
    font-size: 10px;
    color: #666;
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



.backlink-loading,
.backlink-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100px;
    color: #666;
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
