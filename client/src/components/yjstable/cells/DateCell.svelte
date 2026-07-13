<script lang="ts">
interface Props {
    value: unknown;
    editable: boolean;
    onCommit: (value: string | number | boolean | null) => void;
}

let { value, editable, onCommit }: Props = $props();

const current = $derived(value === null || value === undefined ? "" : String(value).slice(0, 10));
</script>

<input
    type="date"
    class="cell-date"
    value={current}
    disabled={!editable}
    onchange={(e) => {
        const v = (e.target as HTMLInputElement).value;
        onCommit(v === "" ? null : v);
    }}
/>

<style>
.cell-date {
    width: 100%;
    border: none;
    background: transparent;
    padding: 2px 4px;
    font: inherit;
}

.cell-date:disabled {
    color: #4b5563;
}
</style>
