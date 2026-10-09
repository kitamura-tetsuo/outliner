<script lang="ts">
interface Props {
    value: unknown;
    editable: boolean;
    /** Allowed values, read from the schema's CHECK (col IN (...)) constraint. */
    options?: string[];
    ariaLabel?: string;
    onCommit: (value: string | number | boolean | null) => void;
    onRequestFocus?: () => void;
}

let { value, editable, options = [], ariaLabel, onCommit, onRequestFocus: _ }: Props = $props();

const current = $derived(value === null || value === undefined ? "" : String(value));
</script>

<select
    class="cell-select"
    class:readonly={!editable}
    aria-label={ariaLabel || "Select value"}
    aria-disabled={!editable}
    value={current}
    onpointerdown={(e: Event) => e.stopPropagation()}
    onmousedown={(e: Event) => e.stopPropagation()}
    onmouseup={(e: Event) => e.stopPropagation()}
    onclick={(e: Event) => {
        e.stopPropagation();
        (e.target as HTMLElement).focus();
    }}
    onkeydown={(e) => {
        if (!editable && ["ArrowDown", "ArrowUp", "Home", "End", " "].includes(e.key)) {
            e.preventDefault();
        }
    }}
    onchange={(e) => {
        if (!editable) return;
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
    max-width: 100%;
    box-sizing: border-box;
    border: none;
    background: transparent;
    padding: 2px 4px;
    font: inherit;
}

.cell-select.readonly {
    color: #4b5563;
    appearance: none;
}
</style>
