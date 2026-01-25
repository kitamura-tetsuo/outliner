<script lang="ts">
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import { onMount } from "svelte";

type Option = { id: string; path: string; };

interface AliasPickerVisibilityEvent {
    detail?: {
        visible: boolean;
    };
}

let selectedIndex = $state(0);
let pickerElement = $state<HTMLDivElement>();
let inputElement = $state<HTMLInputElement>();
// Avoid two-way binding to store to prevent effect cycles
let query = $state(aliasPickerStore.query || "");
// options always references aliasPickerStore.options (declarative rendering with {#each})

let visible = $derived(!!aliasPickerStore.isVisible);

// Derived active descendant ID for ARIA
let activeDescendantId = $derived(visible && selectedIndex >= 0 ? `alias-option-${selectedIndex}` : undefined);

onMount(() => {
    const onVis = (e: AliasPickerVisibilityEvent) => { try { visible = !!(e?.detail?.visible); } catch {} };
    window.addEventListener("aliaspicker-visibility", onVis);
    return () => window.removeEventListener("aliaspicker-visibility", onVis);
});

function getFilteredOptions(): Option[] {
    const q = (query || "").toLowerCase();
    const selfId = aliasPickerStore.itemId as string | null;
    const opts: Option[] = Array.isArray(aliasPickerStore.options) ? (aliasPickerStore.options as Option[]) : [];
    return opts.filter((o: Option) => o.id !== selfId && o.path.toLowerCase().includes(q));
}

// Reset selected index only when input value changes (limit side effects with DOM events)
function handleInput() {
    selectedIndex = 0;
    try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
}

function confirm(id: string) {
    try {
        aliasPickerStore.confirmById(id);
    } catch (error) {
        console.warn("AliasPicker confirm error:", error);
    }
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        aliasPickerStore.hide();
        return;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.min(selectedIndex + 1, Math.max(getFilteredOptions().length - 1, 0));
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const options = getFilteredOptions();
        if (options[selectedIndex]) {
            confirm(options[selectedIndex].id);
        } else {
            aliasPickerStore.hide();
        }
        return;
    }
}

// Initialize localOptions from store via event to avoid tight coupling


// Focus immediately when visualized (both initial/redisplay)
$effect(() => {
    if (aliasPickerStore.isVisible) {
        try {
            // First picker body
            pickerElement?.focus();
            // Next to search input (if exists)
            setTimeout(() => {
                inputElement?.focus();
            }, 0);
            // Sync selected index to external store
            try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
        } catch {}
    }
});
</script>
{#if visible}
    <div
        class="alias-picker"
        onkeydown={handleKeydown}
        tabindex="0"
        role="dialog"
        aria-modal="true"
        aria-label="Select alias"
        bind:this={pickerElement}
    >
        <input
            type="text"
            bind:value={query}
            placeholder="Select item"
            oninput={handleInput}
            bind:this={inputElement}
            role="combobox"
            aria-autocomplete="list"
            aria-controls="alias-results-list"
            aria-expanded="true"
            aria-activedescendant={activeDescendantId}
            aria-label="Filter aliases"
        />
        <ul id="alias-results-list" role="listbox">
            {#each getFilteredOptions() as opt, index (opt.id)}
                <li
                    id="alias-option-{index}"
                    role="option"
                    aria-selected={index === selectedIndex}
                    class:selected={index === selectedIndex}
                >
                    <button
                        tabindex="-1"
                        data-id={opt.id}
                        onclick={() => confirm(opt.id)}
                        onmouseenter={() => { selectedIndex = index; try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {} }}
                    >
                        {opt.path}
                    </button>
                </li>
            {/each}
        </ul>
    </div>
{/if}
<style>
.alias-picker {
    position: fixed;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 1px solid #ccc;
    padding: 8px;
    z-index: 1000;
    max-height: 300px;
    overflow: auto;
}
.alias-picker ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 200px;
    overflow: auto;
}
.alias-picker li {
    display: block;
    width: 100%;
}
.alias-picker li button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 4px;
    border: none;
    background: none;
    cursor: pointer;
}
.alias-picker li.selected button {
    background-color: #e6f3ff;
    color: #0066cc;
}
.alias-picker li button:hover {
    background-color: #f0f0f8;
}
</style>
