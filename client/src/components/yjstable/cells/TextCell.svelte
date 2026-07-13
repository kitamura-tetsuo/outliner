<script lang="ts">
interface Props {
    value: unknown;
    editable: boolean;
    onCommit: (value: string | number | boolean | null) => void;
}

let { value, editable, onCommit }: Props = $props();
let editing = $state(false);

function commit(e: Event) {
    editing = false;
    onCommit((e.target as HTMLInputElement).value);
}
</script>

{#if editing && editable}
    <!-- svelte-ignore a11y_autofocus -->
    <input
        class="cell-input"
        type="text"
        value={value === null || value === undefined ? "" : String(value)}
        autofocus
        onblur={commit}
        onkeydown={(e) => {
            if (e.key === "Enter") commit(e);
            if (e.key === "Escape") editing = false;
        }}
    />
{:else}
    <button
        type="button"
        class="cell-value"
        class:readonly={!editable}
        disabled={!editable}
        onclick={() => {
            if (editable) editing = true;
        }}
    >{value === null || value === undefined ? "" : String(value)}</button>
{/if}

<style>
.cell-input {
    width: 100%;
    border: none;
    padding: 2px 4px;
    outline: 2px solid #2563eb;
    background: white;
}

.cell-value {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 2px 4px;
    min-height: 1.4em;
    cursor: pointer;
    font: inherit;
    color: inherit;
}

.cell-value.readonly {
    cursor: default;
    color: #4b5563;
}
</style>
