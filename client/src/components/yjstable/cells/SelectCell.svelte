<script lang="ts">
interface Props {
    value: unknown;
    editable: boolean;
    /** Allowed values, read from the schema's CHECK (col IN (...)) constraint. */
    options?: string[];
    onCommit: (value: string | number | boolean | null) => void;
}

let { value, editable, options = [], onCommit }: Props = $props();

const current = $derived(value === null || value === undefined ? "" : String(value));
</script>

<select
    class="cell-select"
    value={current}
    disabled={!editable}
    onchange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        onCommit(v === "" ? null : v);
    }}
>
    <option value=""></option>
    {#each options as option (option)}
        <option value={option}>{option}</option>
    {/each}
    {#if current !== "" && !options.includes(current)}
        <option value={current}>{current}</option>
    {/if}
</select>

<style>
.cell-select {
    width: 100%;
    border: none;
    background: transparent;
    padding: 2px 4px;
    font: inherit;
}

.cell-select:disabled {
    color: #4b5563;
    appearance: none;
}
</style>
