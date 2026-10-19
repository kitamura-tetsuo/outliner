<script lang="ts">
interface Props {
    value: unknown;
    editable: boolean;
    ariaLabel?: string;
    onEditStart?: () => void;
    onEditEnd?: () => void;
    onCommit: (value: string | number | boolean | null) => void;
    onRequestFocus?: () => void;
}

let { value, editable, ariaLabel, onCommit, onEditStart, onEditEnd, onRequestFocus: _ }: Props = $props();
let interactionActive = false;
function beginEdit(): void {
    if (!editable || interactionActive) return;
    interactionActive = true;
    onEditStart?.();
}
function endEdit(): void {
    interactionActive = false;
    onEditEnd?.();
}
</script>

<input
    type="checkbox" aria-label={ariaLabel || "Toggle cell value"}
    class="cell-checkbox"
    checked={value === true || value === "true"}
    disabled={!editable}
    onfocus={beginEdit}
    onpointerdown={beginEdit}
    onkeydown={beginEdit}
    onblur={endEdit}
    onchange={(e) => {
        try { onCommit((e.target as HTMLInputElement).checked); }
        finally { endEdit(); }
    }}
/>

<style>
.cell-checkbox {
    margin: 2px 4px;
}
</style>
