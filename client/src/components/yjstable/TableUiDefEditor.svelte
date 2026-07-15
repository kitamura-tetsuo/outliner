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
}

let { handles, schema, query, componentTypes }: Props = $props();

const COMPONENT_TYPES = ["text", "number", "checkbox", "select", "date"] as const;

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
        <p class="editor-label">Cell components</p>
        <div class="component-rows">
            {#each schema.columns as column (column.name)}
                <div class="component-row">
                    <span class="column-name">{column.name}</span>
                    <span class="column-type">{column.dataType}</span>
                    <select
                        data-testid={`yjs-table-component-${column.name}`}
                        value={isCellComponentType(componentTypes[column.name])
                        ? componentTypes[column.name]
                        : "auto"}
                        onchange={(e) => setComponentType(column.name, (e.target as HTMLSelectElement).value)}
                    >
                        <option value="auto">auto ({defaultCellType(column)})</option>
                        {#each COMPONENT_TYPES as type (type)}
                            <option value={type}>{type}</option>
                        {/each}
                    </select>
                    {#if column.checkOptions && column.checkOptions.length > 0}
                        <span class="check-options" title="Options from CHECK constraint">
                            [{column.checkOptions.join(", ")}]
                        </span>
                    {/if}
                </div>
            {/each}
        </div>
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
</style>
