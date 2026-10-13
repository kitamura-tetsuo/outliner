<script lang="ts">
import { deriveSqlName, sqlNameError } from "../../services/yjstable/sqlNames";
import { TABLE_PRESETS, type TablePreset } from "../../services/yjstable/tablePresets";
import type { TableRegistryEntry } from "../../services/yjstable/tableDocs";

interface Props {
    existingTables: TableRegistryEntry[];
    onCreate: (preset: TablePreset, name: string, sqlName: string) => void;
    buttonLabel?: string;
}

let { existingTables, onCreate, buttonLabel = "Create" }: Props = $props();
let presetKey = $state<TablePreset["key"]>("tasks");
let newTableName = $state("");
let newSqlName = $state("");
let sqlNameEdited = $state(false);
let createError = $state<string | undefined>();

const preset = $derived(TABLE_PRESETS.find(option => option.key === presetKey) ?? TABLE_PRESETS[0]);
const takenSqlNames = $derived(existingTables.map(table => table.sqlName).filter(Boolean));
const suggestedSqlName = $derived(deriveSqlName(newTableName.trim() || preset.defaultSqlName, takenSqlNames));
const effectiveSqlName = $derived(sqlNameEdited ? newSqlName.trim() : suggestedSqlName);

function submit() {
    createError = sqlNameError(effectiveSqlName);
    if (createError) return;
    if (takenSqlNames.includes(effectiveSqlName)) {
        createError = 'SQL name "' + effectiveSqlName + '" is already used in this project';
        return;
    }
    try {
        onCreate(preset, newTableName.trim() || preset.name, effectiveSqlName);
        createError = undefined;
    } catch (error) {
        createError = error instanceof Error ? error.message : String(error);
    }
}
</script>

<div class="table-creation-form" data-testid="table-creation-form">
    <div class="create-form">
        <input
            type="text"
            placeholder="Table name"
            aria-label="Table name"
            data-testid="yjs-table-name-input"
            value={newTableName}
            oninput={(event) => { newTableName = event.currentTarget.value; createError = undefined; }}
        />
        <select
            aria-label="Preset"
            data-testid="yjs-table-preset-select"
            value={presetKey}
            onpointerdown={(event) => event.stopPropagation()}
            onmousedown={(event) => event.stopPropagation()}
            onmouseup={(event) => event.stopPropagation()}
            onclick={(event) => { event.stopPropagation(); event.currentTarget.focus(); }}
            onchange={(event) => { presetKey = event.currentTarget.value as TablePreset["key"]; createError = undefined; }}
        >
            {#each TABLE_PRESETS as option (option.key)}
                <option value={option.key}>{option.name}</option>
            {/each}
        </select>
        <input
            type="text"
            aria-label="SQL name"
            placeholder={suggestedSqlName}
            data-testid="yjs-table-sql-name-input"
            value={effectiveSqlName}
            oninput={(event) => {
                sqlNameEdited = true;
                newSqlName = event.currentTarget.value;
                createError = undefined;
            }}
        />
        <button type="button" data-testid="yjs-table-create" onclick={submit}>{buttonLabel}</button>
    </div>
    <p class="hint">Queries reference this table as <code>{effectiveSqlName || "?"}</code>.</p>
    {#if createError}
        <p class="create-error" role="alert" data-testid="yjs-table-create-error">{createError}</p>
    {/if}
</div>

<style>
.table-creation-form { display: flex; flex-direction: column; gap: 6px; }
.create-form { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.create-form input, .create-form select { border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 6px; font-size: 0.85rem; }
.create-form button { border: 1px solid #2563eb; border-radius: 4px; background: #2563eb; color: #fff; padding: 4px 12px; cursor: pointer; font-size: 0.85rem; }
.hint { font-size: 0.85rem; color: #6b7280; }
.create-error { color: #991b1b; font-size: 0.85rem; }
</style>
