<script lang="ts">
import { getLogger } from "../lib/logger";
const logger = getLogger("AliasPicker");

import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import { onMount, tick } from "svelte";

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
    const onVis = (e: AliasPickerVisibilityEvent) => { try { visible = !!(e?.detail?.visible); } catch (_e) { /* ignore */ } };
    window.addEventListener("aliaspicker-visibility", onVis as EventListener);
    return () => window.removeEventListener("aliaspicker-visibility", onVis as EventListener);
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
    try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch (_e) { /* ignore */ }
}

function confirm(id: string) {
    try {
        aliasPickerStore.confirmById(id);
    } catch (error) {
        logger.warn("AliasPicker confirm error:", error);
    }
}

// handleKeydown removed as native dialog handles Escape, and arrow keys
// or enter are best handled by inputs, though we still need to capture
// them at the input level. Actually, since we're binding to the dialog,
// we should put handleKeydown back on the dialog or input. Let's add it to the input.
function handleKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.min(selectedIndex + 1, Math.max(getFilteredOptions().length - 1, 0));
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch (_e) { /* ignore */ }
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch (_e) { /* ignore */ }
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


function initDialog(node: HTMLDialogElement) {
    if (!node.open && typeof node.showModal === 'function') {
        node.showModal();
    }
    pickerElement = node as unknown as HTMLDivElement;
    return {};
}

// Focus immediately when visible (both initial and re-display)
$effect(() => {
    if (aliasPickerStore.isVisible) {
        try {
            // First, the picker body
            pickerElement?.focus();
            // Next, the search input (if it exists)
            tick().then(() => {
                inputElement?.focus();
            });
            // Sync selected index to external store
            try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch (_e) { /* ignore */ }
        } catch (_e) { /* ignore */ }
    }
});
</script>
{#if visible}
    <dialog
        class="alias-picker"
        aria-label="Select alias"
        oncancel={(e) => { e.preventDefault(); aliasPickerStore.hide(); }}
        onclick={(e) => { if (e.target === e.currentTarget) aliasPickerStore.hide(); }}
        use:initDialog
    >
        <div class="dialog-content" role="document">
        <input
            type="text"
            onkeydown={handleKeydown}
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
                    <button type="button"
                        tabindex="-1"
                        data-id={opt.id}
                        onclick={() => confirm(opt.id)}
                        onmouseenter={() => { selectedIndex = index; try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch (_e) { /* ignore */ } }}
                    >
                        {opt.path}
                    </button>
                </li>
            {/each}
        </ul>
        </div>
    </dialog>
{/if}
<style>
.alias-picker {
    margin: auto;
    background: white;
    border: 1px solid #ccc;
    padding: 0;
    z-index: 1000;
    max-height: 300px;
}
.alias-picker::backdrop {
    background: rgb(0 0 0 / 35%);
}
.dialog-content {
    padding: 8px;
    max-height: 100%;
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
