<script lang="ts">
import type { GridNavDirection } from "../../../services/yjstable/gridKeyboardNav";

interface Props {
    value: unknown;
    editable: boolean;
    ariaLabel?: string;
    /** See TextCell: seeds a freshly-opened editor when typing starts the edit. */
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

$effect(() => {
    if (editSeed !== undefined && editable && !editing) setEditing(true);
});

function commit(e: Event) {
    setEditing(false);
    const raw = (e.target as HTMLInputElement).value.trim();
    if (raw === "") {
        onCommit(null);
        return;
    }
    const parsed = Number(raw);
    // Non-numeric input is stored as-is; the sync adapter reports it as a
    // cast error for this record instead of silently dropping it.
    onCommit(Number.isFinite(parsed) ? parsed : raw);
}
</script>

{#if editing && editable}
    <!-- svelte-ignore a11y_autofocus -->
    <input
        class="cell-input"
        aria-label={ariaLabel || "Edit cell value"}
        type="number"
        step="any"
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
    text-align: right;
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
