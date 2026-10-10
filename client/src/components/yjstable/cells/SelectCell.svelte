<script lang="ts">
interface Props {
    value: unknown;
    editable: boolean;
    /** Allowed values, read from CHECK metadata or scalar ENUM labels. */
    options?: string[];
    ariaLabel?: string;
    onCommit: (value: string | number | boolean | null) => void;
    onEditStart?: () => void;
    onEditEnd?: () => void;
    onRequestFocus?: () => void;
}

let { value, editable, options = [], ariaLabel, onCommit, onEditStart, onEditEnd, onRequestFocus: _ }: Props = $props();
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

const nullOption = $derived.by(() => {
    let candidate = "__outliner_sql_null__";
    while (options.includes(candidate)) candidate += "_";
    return candidate;
});
const current = $derived(value === null || value === undefined ? nullOption : String(value));
</script>

<select
    class="cell-select"
    aria-label={ariaLabel || "Select value"}
    value={current}
    disabled={!editable}
    onfocus={beginEdit}
    onblur={endEdit}
    onkeydown={beginEdit}
    onpointerdown={(e: Event) => {
        beginEdit();
        e.stopPropagation();
    }}
    onmousedown={(e: Event) => e.stopPropagation()}
    onmouseup={(e: Event) => e.stopPropagation()}
    onclick={(e: Event) => {
        e.stopPropagation();
        (e.target as HTMLElement).focus();
    }}
    onchange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        try {
            onCommit(v === nullOption ? null : v);
        } finally {
            endEdit();
        }
    }}
>
    <option value={nullOption}></option>
    {#each options as option (option)}
        <option value={option}>{option}</option>
    {/each}
    {#if current !== nullOption && !options.includes(current)}
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

.cell-select:disabled {
    color: #4b5563;
    appearance: none;
}
</style>
