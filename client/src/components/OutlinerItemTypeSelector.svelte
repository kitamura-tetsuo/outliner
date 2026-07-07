<script lang="ts">
    let {
        componentType,
        compTypeValue,
        handleComponentTypeChange
    }: {
        componentType: string | undefined;
        compTypeValue: string | undefined;
        handleComponentTypeChange: (newType: string) => void;
    } = $props();
</script>

<div class="component-selector">
    <select
        value={(componentType ?? compTypeValue) || "none"}
        onchange={(e: Event) => handleComponentTypeChange(String((e.target as HTMLSelectElement)?.value ?? "none"))}
        aria-label="Item component type"
    >
        <option value="none">Text</option>
        <option value="table">Table</option>
        <option value="sqltable">SQL Table</option>
        <option value="chart">Chart</option>
        <option value="sql">SQL Block</option>
    </select>
</div>

<style>
    .component-selector {
        opacity: 0;
        pointer-events: auto;
        transition: opacity 0.2s ease;
        margin-right: 8px;
    }

    :global(.outliner-item:hover) .component-selector,
    .component-selector:focus-within {
        opacity: 1;
        pointer-events: auto;
    }

    .component-selector select {
        padding: 2px 4px;
        font-size: 11px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background-color: white;
        color: #666;
        cursor: pointer;
    }

    .component-selector select:focus {
        outline: 2px solid #3b82f6;
        border-color: transparent;
    }
</style>
