<script lang="ts">
import type { GridNavDirection } from "../../../services/yjstable/gridKeyboardNav";

interface Props {
    value: unknown;
    editable: boolean;
    ariaLabel?: string;
    /**
     * Whether this cell is the one active editor. Bindable: Grid flips it to
     * true to start editing from the keyboard (F2/Enter/typing a character)
     * without a click, and reads it back when this cell's own click/blur/
     * Enter/Escape handling ends the session, so it always knows which cell
     * (if any) currently owns the editor.
     */
    editing?: boolean;
    /**
     * Initial input text for an edit started by typing a printable character
     * in Grid navigation mode. Stable for the lifetime of one edit session,
     * so it seeds the freshly-mounted input without fighting the user's
     * typing on a later unrelated re-render.
     */
    editSeed?: string;
    onCommit: (value: string | number | boolean | null) => void;
    /** Grid navigation move after a keyboard commit/cancel; omitted means "stay on this cell". */
    onRequestFocus?: (direction?: GridNavDirection) => void;
}

let { value, editable, ariaLabel, editing = $bindable(false), editSeed, onCommit, onRequestFocus }: Props = $props();

function commit(e: Event) {
    editing = false;
    onCommit((e.target as HTMLInputElement).value);
}

function focusNode(node: HTMLElement) {
    node.focus();
}
</script>

{#if editing && editable}
    <input
        use:focusNode
        class="cell-input"
        aria-label={ariaLabel || "Edit cell value"}
        type="text"
        value={editSeed ?? (value === null || value === undefined ? "" : String(value))}
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
        aria-disabled={!editable}
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
