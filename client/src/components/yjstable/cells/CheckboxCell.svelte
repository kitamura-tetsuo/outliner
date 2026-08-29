<script lang="ts">
interface Props {
    value: unknown;
    editable: boolean;
    ariaLabel?: string;
    onCommit: (value: string | number | boolean | null) => void;
    onRequestFocus?: () => void;
}

let { value, editable, ariaLabel, onCommit, onRequestFocus: _ }: Props = $props();
</script>

<input
    type="checkbox" aria-label={ariaLabel || "Toggle cell value"}
    class="cell-checkbox"
    checked={value === true || value === "true"}
    disabled={!editable}
    onchange={(e) => onCommit((e.target as HTMLInputElement).checked)}
/>

<style>
.cell-checkbox {
    margin: 2px 4px;
}
</style>
