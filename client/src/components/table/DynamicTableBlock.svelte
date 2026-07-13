<script lang="ts">
import type { Item, Table } from "../../schema/app-schema";
import { TableSyncAdapter } from "../../services/syncAdapter";
import type { QueryResult, PGliteError } from "../../services/pgliteService";
import type { IntrospectedColumn } from "../../services/schemaParser";
import { onMount, onDestroy } from "svelte";

import UiDefinitionEditor from "./UiDefinitionEditor.svelte";
import DynamicGrid from "./DynamicGrid.svelte";
import ChartPanel from "../ChartPanel.svelte"; // Re-using existing chart component, though it might need slight adaptation later

interface Props {
    item: Item;
}

let { item }: Props = $props();

let table: Table | null = $state(null);
let syncAdapter: TableSyncAdapter | null = null;

let viewMode = $state<"grid" | "schema" | "ui" | "chart">("grid");
let data = $state<QueryResult | null>(null);
let syncError = $state<PGliteError | null>(null);
let schemaColumns = $state<IntrospectedColumn[]>([]);

let draftSchema = $state("");
let isInitializing = $state(true);

onMount(async () => {
    // Determine the table subdoc associated with this item
    // If not exists, we might need to create it. Assuming componentType === "table" is set elsewhere
    // We store the tableId on the item's map. Let's assume it's `tableId`.
    let tableId = item.yMap.get("tableId") as string;

    // For demo/migration, if no tableId exists, create a new subdoc via project
    if (!tableId) {
        tableId = `tbl_${item.id}`;
        item.yMap.set("tableId", tableId);

        // This requires Project level access.
        const project = globalThis.window?.appStore?.project; // Global access just for creating
        if (project) {
             table = project.createTable(tableId, "New Table");
             table.schema.insert(0, "CREATE TABLE demo (id TEXT PRIMARY KEY, name TEXT);");
             table.ui.set("query", "SELECT * FROM demo;");
        }
    } else {
        const project = globalThis.window?.appStore?.project;
        if (project) {
            table = project.getTable(tableId) || null;
        }
    }

    if (table) {
        draftSchema = table.schema.toString();

        // Initialize Sync Adapter
        syncAdapter = new TableSyncAdapter(
            table.id,
            table.data,
            table.schema,
            table.ui
        );

        syncAdapter.onQueryUpdate = (res, err) => {
            if (err) syncError = err;
            else {
                syncError = null;
                data = res;
            }
        };

        syncAdapter.onSyncError = (err) => {
            syncError = err;
        };

        await syncAdapter.init();
        // Expose parsed columns
        schemaColumns = (syncAdapter as unknown as { columns: IntrospectedColumn[] }).columns || [];
    }

    isInitializing = false;
});

onDestroy(() => {
    if (syncAdapter) {
        syncAdapter.destroy();
    }
});

async function applySchema() {
    if (!table || !syncAdapter) return;

    // Simple apply: replace schema text.
    // SyncAdapter needs re-initialization to parse new schema and re-bind.
    const oldLen = table.schema.length;
    table.schema.delete(0, oldLen);
    table.schema.insert(0, draftSchema);

    syncAdapter.destroy();
    await syncAdapter.init();
    schemaColumns = (syncAdapter as unknown as { columns: IntrospectedColumn[] }).columns || [];
}
</script>

<div class="dynamic-table-block"
     onmousedown={(e) => e.stopPropagation()}
     onclick={(e) => e.stopPropagation()}
     role="presentation"
>
    {#if isInitializing}
        <div class="loading">Loading table...</div>
    {:else if !table}
        <div class="error">Failed to load table sub-document.</div>
    {:else}
        {#key table.ydoc.guid}
            <div class="header">
                <div class="title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                    <span>{table.name}</span>
                </div>
                <div class="controls">
                    <select bind:value={viewMode}>
                        <option value="grid">Grid</option>
                        <option value="schema">Schema Editor</option>
                        <option value="ui">UI Definition</option>
                        <option value="chart">Chart</option>
                    </select>
                </div>
            </div>

            {#if syncError}
                <div class="error-banner">
                    <strong>Error:</strong> {syncError.message}
                    {#if syncError.recordId} (Record: {syncError.recordId}){/if}
                    {#if syncError.column} (Column: {syncError.column}){/if}
                </div>
            {/if}

            <div class="content">
                {#if viewMode === "grid"}
                    <DynamicGrid
                        data={data}
                        uiMap={table.ui}
                        dataMap={table.data}
                        schemaColumns={schemaColumns}
                    />
                {:else if viewMode === "schema"}
                    <div class="schema-editor">
                        <textarea bind:value={draftSchema} rows="6" placeholder="CREATE TABLE ..."></textarea>
                        <button onclick={applySchema}>Apply Schema</button>
                    </div>
                {:else if viewMode === "ui"}
                    <UiDefinitionEditor uiMap={table.ui} />
                {:else if viewMode === "chart"}
                    <div class="chart-wrapper">
                         <!-- Fallback for now if ChartPanel needs specific adaptation -->
                         <p>Chart view depends on the same data. Ensure componentsConfig maps values properly.</p>
                         <ChartPanel {item} />
                    </div>
                {/if}
            </div>
        {/key}
    {/if}
</div>

<style>
.dynamic-table-block {
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
    margin-top: 8px;
    overflow: hidden;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #fafafa;
    border-bottom: 1px solid #eaeaea;
}
.title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
}
.error-banner {
    background: #fee;
    color: #c00;
    padding: 8px;
    font-size: 0.9em;
    border-bottom: 1px solid #fcc;
}
.content {
    padding: 12px;
}
.schema-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.schema-editor textarea {
    width: 100%;
    font-family: monospace;
    padding: 8px;
    box-sizing: border-box;
}
button {
    align-self: flex-start;
    padding: 6px 12px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
</style>
