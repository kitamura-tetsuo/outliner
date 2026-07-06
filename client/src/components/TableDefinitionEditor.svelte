<script lang="ts">


interface Props {
    draftSql: string;
    errorMessage?: string;
    columnsLength?: number;
    onsave: (sql: string) => void;
    oncancel: () => void;
}

let { draftSql = $bindable(), errorMessage = "", columnsLength = 0, onsave, oncancel }: Props = $props();

function save() {
    onsave(draftSql);
}
</script>

<div class="definition">
    <label class="definition-label" for="sql-table-ddl">Define table with SQL</label>
    <textarea
        id="sql-table-ddl"
        bind:value={draftSql}
        rows="6"
        class="ddl-input"
        placeholder="CREATE TABLE ..."
        aria-label="CREATE TABLE statement"
    ></textarea>
    {#if errorMessage}
        <p class="error" role="alert">{errorMessage}</p>
    {/if}
    <div class="definition-actions">
        <button type="button" class="primary" onclick={save} aria-label="Create table from SQL">
            Create table
        </button>
        {#if columnsLength > 0}
            <button type="button" onclick={oncancel} aria-label="Cancel schema edit">
                Cancel
            </button>
        {/if}
    </div>
</div>

<style>
.definition-label {
    display: block;
    font-weight: bold;
    margin-bottom: 4px;
}

.ddl-input {
    width: 100%;
    font-family: var(--mono-font, monospace);
    padding: 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
}

.definition-actions {
    display: flex;
    gap: 8px;
    margin: 8px 0;
}

.error {
    color: #c00;
    margin: 6px 0;
}

button.primary {
    background-color: #007bff;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 4px 12px;
    cursor: pointer;
}
</style>
