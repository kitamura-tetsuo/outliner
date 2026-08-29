<script lang="ts">
interface Props {
    value: unknown;
    editable: boolean;
    ariaLabel?: string;
    onCommit: (value: string | number | boolean | null) => void;
    onRequestFocus?: () => void;
}

let { value, editable, ariaLabel, onCommit, onRequestFocus }: Props = $props();
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
        aria-label={ariaLabel || "Edit cell value"}
        type="text"
        value={value === null || value === undefined ? "" : String(value)}
        autofocus
        onblur={commit}
        onkeydown={(e) => {
            if (e.key === "Enter") {
                commit(e);
                onRequestFocus?.();
            } else if (e.key === "Escape") {
                editing = false;
                onRequestFocus?.();
            }
        }}
    />
{:else}
    <button
        type="button"
        class="cell-value"
        aria-label={value === null || value === undefined || String(value) === "" ? `Empty cell, ${ariaLabel || "cell"}` : `${String(value)}, ${ariaLabel || "cell"}`}
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
