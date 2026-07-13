<script lang="ts">
interface Props {
    value: unknown;
    editable: boolean;
    onCommit: (value: string | number | boolean | null) => void;
}

let { value, editable, onCommit }: Props = $props();
</script>

<input
    type="checkbox"
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
