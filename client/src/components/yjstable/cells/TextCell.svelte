<script lang="ts">
import type { GridNavDirection } from "../../../services/yjstable/gridKeyboardNav";

interface Props {
    value: unknown;
    editable: boolean;
    ariaLabel?: string;
    /**
     * Initial input text for an edit started by typing a printable character
     * in Grid navigation mode. Stable for the lifetime of one edit session
     * (the parent only clears it once `onEditingChange(false)` fires), so it
     * seeds the freshly-mounted input without fighting the user's typing on
     * later re-renders.
     */
    editSeed?: string;
    onCommit: (value: string | number | boolean | null) => void;
    /** Grid navigation move after a keyboard commit/cancel; omitted means "stay on this cell". */
    onRequestFocus?: (direction?: GridNavDirection) => void;
    /** Reports edit-mode transitions so Grid can track which cell owns the one active editor. */
    onEditingChange?: (editing: boolean) => void;
}

let { value, editable, ariaLabel, editSeed, onCommit, onRequestFocus, onEditingChange }: Props = $props();
let editing = $state(false);

function setEditing(next: boolean) {
    editing = next;
    onEditingChange?.(next);
}

// Enter edit mode when Grid seeds this cell with typed text (F2/Enter use
// click()-equivalent activation instead, so they never set editSeed).
$effect(() => {
    if (editSeed !== undefined && editable && !editing) setEditing(true);
});

function commit(e: Event) {
    setEditing(false);
    onCommit((e.target as HTMLInputElement).value);
}
</script>

{#if editing && editable}
    <!-- svelte-ignore a11y_autofocus -->
    <input
        class="cell-input"
        aria-label={ariaLabel || "Edit cell value"}
        type="text"
        value={editSeed ?? (value === null || value === undefined ? "" : String(value))}
        autofocus
        onblur={commit}
        onkeydown={(e) => {
            if (e.isComposing) return;
            if (e.key === "Enter") {
                commit(e);
                onRequestFocus?.(e.shiftKey ? "up" : "down");
            } else if (e.key === "Tab") {
                e.preventDefault();
                commit(e);
                onRequestFocus?.(e.shiftKey ? "left" : "right");
            } else if (e.key === "Escape") {
                setEditing(false);
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
        aria-disabled={!editable}
        onclick={() => {
            if (editable) setEditing(true);
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
