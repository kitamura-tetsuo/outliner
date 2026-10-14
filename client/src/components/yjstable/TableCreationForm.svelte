<script lang="ts">
import { TABLE_PRESETS, type TablePreset } from "../../services/yjstable/tablePresets";
import { deriveSqlName, sqlNameError } from "../../services/yjstable/sqlNames";

export interface TableCreationInput {
    preset: TablePreset;
    name: string;
    sqlName: string;
}

interface Props {
    takenSqlNames?: string[];
    oncreate: (input: TableCreationInput) => string | undefined;
}

let { takenSqlNames = [], oncreate }: Props = $props();
let presetKey = $state<TablePreset["key"]>("tasks");
let displayName = $state("");
let sqlName = $state("");
let sqlNameEdited = $state(false);
let error = $state<string | undefined>();

const preset = $derived(TABLE_PRESETS.find(candidate => candidate.key === presetKey) ?? TABLE_PRESETS[0]);
const suggestedSqlName = $derived(deriveSqlName(displayName.trim() || preset.defaultSqlName, takenSqlNames));
const effectiveSqlName = $derived(sqlNameEdited ? sqlName.trim() : suggestedSqlName);

function submit() {
    error = sqlNameError(effectiveSqlName);
    if (error) return;
    if (takenSqlNames.includes(effectiveSqlName)) {
        error = `SQL name "${effectiveSqlName}" is already used in this project`;
        return;
    }

    error = oncreate({
        preset,
        name: displayName.trim() || preset.name,
        sqlName: effectiveSqlName,
    });
}
</script>

<form class="create-form" data-testid="table-creation-form" onsubmit={(event) => {
    event.preventDefault();
    submit();
}}>
    <input
        type="text"
        placeholder="Table name"
        data-testid="yjs-table-name-input"
        value={displayName}
        oninput={(event) => displayName = event.currentTarget.value}
    />
    <select
        aria-label="Preset"
        data-testid="yjs-table-preset-select"
        value={presetKey}
        onpointerdown={(event) => event.stopPropagation()}
        onmousedown={(event) => event.stopPropagation()}
        onmouseup={(event) => event.stopPropagation()}
        onclick={(event) => {
            event.stopPropagation();
            event.currentTarget.focus();
        }}
        onchange={(event) => presetKey = event.currentTarget.value as TablePreset["key"]}
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
            sqlName = event.currentTarget.value;
        }}
    />
    <button type="submit" data-testid="yjs-table-create">Create</button>
</form>
<p class="hint">Queries reference this table as <code>{effectiveSqlName || "?"}</code>.</p>
{#if error}
    <p class="create-error" data-testid="yjs-table-create-error">{error}</p>
{/if}

<style>
.create-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.create-form input, .create-form select { border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 6px; font-size: .85rem; }
.create-form button { border: 1px solid #2563eb; border-radius: 4px; background: #2563eb; color: white; padding: 4px 12px; cursor: pointer; font-size: .85rem; }
.hint { font-size: .75rem; color: #6b7280; margin: 0; }
.hint code { font-family: ui-monospace, monospace; background: #f3f4f6; border-radius: 3px; padding: 0 4px; }
.create-error { font-size: .8rem; color: #dc2626; margin: 0; }
</style>
