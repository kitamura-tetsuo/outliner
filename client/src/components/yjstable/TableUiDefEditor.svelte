<script lang="ts">
// Structured (form) editor for the UI Definition Y.Map. There is no YAML or
// other text representation: every form input writes only its own key into
// the Y.Map (nested Y.Map per column for component settings), so concurrent
// edits to different fields merge cleanly.

import * as Y from "yjs";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import { defaultCellType, isCellComponentType } from "./cellComponents";

interface Props {
    handles: TableHandles;
    schema: ParsedTableSchema | undefined;
    /** Mirror of the UI Definition (kept in sync by the parent view). */
    query: string;
    componentTypes: Record<string, string | undefined>;
    resultColumns: string[];
    queryError: string | undefined;
}

let { handles, schema, query, componentTypes, resultColumns, queryError }: Props = $props();

const COMPONENT_TYPES = ["text", "number", "checkbox", "select", "date"] as const;

const schemaByName = $derived(new Map((schema?.columns ?? []).map((c) => [c.name, c])));
const rows = $derived(resultColumns.map((name) => ({ name, schemaColumn: schemaByName.get(name) })));
const staleConfigs = $derived(
    Object.keys(componentTypes).filter((name) => !resultColumns.includes(name) && componentTypes[name] !== undefined)
);

function commitQuery(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    handles.uiDef.set("query", value);
}

function componentsMap(): Y.Map<unknown> {
    let components = handles.uiDef.get("components");
    if (!(components instanceof Y.Map)) {
        components = new Y.Map<unknown>();
        handles.uiDef.set("components", components);
    }
    return components as Y.Map<unknown>;
}

function setComponentType(column: string, type: string) {
    const components = componentsMap();
    if (type === "auto") {
        // Deleting the key falls back to the schema-derived default.
        components.delete(column);
        return;
    }
    if (!isCellComponentType(type)) return;
    const existing = components.get(column);
    if (existing instanceof Y.Map) {
        existing.set("type", type);
    } else {
        const cfg = new Y.Map<unknown>();
        cfg.set("type", type);
        components.set(column, cfg);
    }
}
</script>

<div class="ui-def-editor" data-testid="yjs-table-ui-editor">
    <label class="editor-label" for="yjs-table-query-input">Query (SELECT)</label>
    <input
        id="yjs-table-query-input"
        data-testid="yjs-table-query-input"
        type="text"
        spellcheck="false"
        value={query}
        onchange={commitQuery}
    />

    {#if schema}
        {#if resultColumns.length > 0}
            <p class="editor-label">Cell components</p>
            <div class="component-rows">
                {#each rows as row (row.name)}
                    <div class="component-row">
                        <span class="column-name">{row.name}</span>
                        <span class="column-type">{row.schemaColumn?.dataType ?? "expression"}</span>
                        <select
                            data-testid={`yjs-table-component-${row.name}`}
                            value={isCellComponentType(componentTypes[row.name])
                            ? componentTypes[row.name]
                            : "auto"}
                            onchange={(e) => setComponentType(row.name, (e.target as HTMLSelectElement).value)}
                        >
                            <option value="auto">auto ({defaultCellType(row.schemaColumn)})</option>
                            {#each COMPONENT_TYPES as type (type)}
                                <option value={type}>{type}</option>
                            {/each}
                        </select>
                        {#if row.schemaColumn?.checkOptions && row.schemaColumn.checkOptions.length > 0}
                            <span class="check-options" title="Options from CHECK constraint">
                                [{row.schemaColumn.checkOptions.join(", ")}]
                            </span>
                        {/if}
                    </div>
                {/each}
            </div>

            {#if staleConfigs.length > 0}
                <p class="editor-label">Hidden configurations (not in SELECT)</p>
                <div class="component-rows stale">
                    {#each staleConfigs as name (name)}
                        <div class="component-row">
                            <span class="column-name stale-name">{name}</span>
                            <span class="column-type stale-type">Currently: {componentTypes[name]}</span>
                            <button
                                type="button"
                                class="clear-btn"
                                data-testid={`yjs-table-clear-stale-${name}`}
                                onclick={() => setComponentType(name, "auto")}
                            >
                                Clear
                            </button>
                        </div>
                    {/each}
                </div>
            {/if}
        {:else}
            <p class="hint">{queryError ? "The query failed; components follow the last successful result." : "Set a SELECT query to configure cell components."}</p>
        {/if}
    {:else}
        <p class="hint">Apply a schema to configure cell components.</p>
    {/if}
</div>

<style>
.ui-def-editor {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.editor-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    margin: 4px 0 0;
}

input,
select {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.85rem;
    background: white;
}

.component-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.component-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
}

.column-name {
    min-width: 8rem;
    font-family: ui-monospace, monospace;
}

.column-type {
    color: #6b7280;
    font-size: 0.75rem;
    min-width: 6rem;
}

.check-options {
    color: #6b7280;
    font-size: 0.75rem;
}

.hint {
    color: #6b7280;
    font-size: 0.8rem;
}

.stale {
    opacity: 0.7;
}

.clear-btn {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    padding: 2px 6px;
    font-size: 0.75rem;
    cursor: pointer;
}
.clear-btn:hover {
    background: #f3f4f6;
}
</style>
