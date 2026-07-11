<script lang="ts">
import type { Item } from "../schema/app-schema";
import ChartQueryEditor from "./ChartQueryEditor.svelte";
import EditableQueryGrid from "./EditableQueryGrid.svelte";
import ChartPanel from "./ChartPanel.svelte";

interface Props {
    item: Item;
}

let { item }: Props = $props();
let showEditor = $state(true);
let viewMode = $state<"grid" | "chart">("grid");

function toggleEditor() {
    showEditor = !showEditor;
}
</script>

<div class="sql-block">
    <div class="sql-block-header">
        <div class="sql-block-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
                <path d="M3 12A9 3 0 0 0 21 12"></path>
            </svg>
            <span>SQL Block</span>
        </div>
        <div class="sql-block-controls"
             onmousedown={(e: Event) => e.stopPropagation()}
             onclick={(e: Event) => e.stopPropagation()}
             onpointerdown={(e: Event) => e.stopPropagation()}
             onmouseup={(e: Event) => e.stopPropagation()}
             role="presentation"
        >
            <select bind:value={viewMode} aria-label="View Mode">
                <option value="grid">Grid</option>
                <option value="chart">Chart</option>
            </select>
            <button type="button" onclick={toggleEditor} aria-label="Toggle SQL Editor">
                {showEditor ? "Hide Editor" : "Show Editor"}
            </button>
        </div>
    </div>

    {#if showEditor}
        <div class="sql-editor-container">
            <ChartQueryEditor {item} />
        </div>
    {/if}

    <div class="sql-content-container">
        {#if viewMode === "grid"}
            <EditableQueryGrid />
        {:else}
            <ChartPanel {item} />
        {/if}
    </div>
</div>

<style>
.sql-block {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    margin-top: 8px;
    background-color: #fafafa;
}

.sql-block-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #eaeaea;
}

.sql-block-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: #333;
}

.sql-block-controls {
    display: flex;
    gap: 8px;
    align-items: center;
}

.sql-block-controls select {
    padding: 2px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background-color: white;
}

.sql-block-controls button {
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 2px 8px;
    color: #374151;
    cursor: pointer;
}

.sql-block-controls button:hover {
    background-color: #e5e7eb;
}

.sql-editor-container {
    margin-bottom: 12px;
}
</style>
