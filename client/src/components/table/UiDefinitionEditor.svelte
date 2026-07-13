<script lang="ts">
import type * as Y from "yjs";
import { onMount, onDestroy } from "svelte";

interface Props {
    uiMap: Y.Map<unknown>;
}

let { uiMap }: Props = $props();

let query = $state(uiMap.get("query") as string || "");
// components Config stores `{ [colName]: { type: string, options?: any } }`
let componentsConfig = $state<Record<string, unknown>>(uiMap.get("components") as Record<string, unknown> || {});

let __unsubscribe: (() => void) | null = null;

onMount(() => {
    const observer = (event: Y.YMapEvent<unknown>) => {
        if (event.keysChanged.has("query")) {
            query = uiMap.get("query") as string || "";
        }
        if (event.keysChanged.has("components")) {
            componentsConfig = uiMap.get("components") as Record<string, unknown> || {};
        }
    };
    uiMap.observe(observer);
    __unsubscribe = () => uiMap.unobserve(observer);
});

onDestroy(() => {
    __unsubscribe?.();
});

function updateQuery(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    uiMap.set("query", val);
}

// Differential update to components map
function updateComponentConfig(colName: string, type: string) {
    const newConfig = { ...componentsConfig };
    if (!type) {
        delete newConfig[colName];
    } else {
        newConfig[colName] = { ...(newConfig[colName] as object || {}), type };
    }
    uiMap.set("components", newConfig);
}
</script>

<div class="ui-definition-editor">
    <div class="field">
        <label for="query-input">Query</label>
        <textarea
            id="query-input"
            value={query}
            oninput={updateQuery}
            placeholder="SELECT * FROM my_table"
            rows="3"
        ></textarea>
    </div>

    <div class="field">
        <label>Column Components</label>
        <div class="component-list">
            <!-- For demo purposes we can add simple UI to map columns, a real one would parse the schema or query results to list columns -->
            <div class="component-item">
                <input type="text" placeholder="Column Name" id="temp-col-name" />
                <select id="temp-col-type">
                    <option value="text">Text</option>
                    <option value="select">Select</option>
                    <option value="checkbox">Checkbox</option>
                </select>
                <button type="button" onclick={() => {
                    const col = (document.getElementById('temp-col-name') as HTMLInputElement).value;
                    const type = (document.getElementById('temp-col-type') as HTMLSelectElement).value;
                    if (col) updateComponentConfig(col, type);
                }}>Add Mapping</button>
            </div>

            {#each Object.entries(componentsConfig) as [col, conf] (col)}
                <div class="component-item existing">
                    <span>{col} -> {(conf as { type: string }).type}</span>
                    <button type="button" onclick={() => updateComponentConfig(col, "")}>Remove</button>
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
.ui-definition-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #f9f9f9;
}
.field label {
    font-weight: bold;
    display: block;
    margin-bottom: 4px;
}
.field textarea {
    width: 100%;
    font-family: monospace;
    padding: 8px;
    box-sizing: border-box;
}
.component-item {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    align-items: center;
}
.component-item.existing {
    padding: 4px;
    background: #eee;
    border-radius: 4px;
}
</style>
