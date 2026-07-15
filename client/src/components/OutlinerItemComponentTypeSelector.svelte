<script lang="ts">
interface Props {
    value: string;
    onChange: (newType: string) => void;
}

let { value, onChange }: Props = $props();
</script>

<div class="component-selector">
    <select
        {value}
        onchange={(e: Event) => onChange(String((e.target as HTMLSelectElement)?.value ?? "none"))}
        onpointerdown={(e: Event) => e.stopPropagation()}
        onmousedown={(e: Event) => e.stopPropagation()}
        onmouseup={(e: Event) => e.stopPropagation()}
        onclick={(e: Event) => e.stopPropagation()}
        aria-label="Item component type"
    >
        <option value="none">Text</option>
        <option value="yjstable">Database</option>
    </select>
</div>

<style>
.component-selector {
    opacity: 0;
    transition: opacity 0.2s;
    margin-left: 8px;
}

:global(.outliner-item:hover) .component-selector,
:global(.outliner-item:focus-within) .component-selector {
    opacity: 1;
}

.component-selector select {
    padding: 2px 4px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.8rem;
    background-color: white;
}

/* On mobile, don't permanently reserve a line of height under every item for a
   control that's invisible most of the time - collapse it out of the layout
   until the item is actively focused. */
@media (max-width: 768px) {
    .component-selector {
        display: none;
    }

    /* Editing state is tracked via data-active (the global textarea, not a
       per-item element, holds real DOM focus, so :focus-within never fires
       here) - see OutlinerItem.svelte's isItemActive. */
    :global(.outliner-item:hover) .component-selector,
    :global(.outliner-item[data-active="true"]) .component-selector {
        display: inline-block;
    }
}
</style>
