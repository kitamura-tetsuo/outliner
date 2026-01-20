<script lang="ts">
import { onMount } from "svelte";
import {
    addItem,
    applyAutoReset,
    type Checklist,
    checklists,
    createChecklist,
    resetChecklist,
    toggleItem,
} from "../services/checklistService";

interface Props {
    title?: string;
    mode?: "shopping" | "packing" | "habit" | "custom";
    rrule?: string;
}

let { title = "My Checklist", mode = "custom", rrule }: Props = $props();
let list: Checklist | undefined = $state(undefined);
let newItem = $state("");

onMount(() => {
    const id = createChecklist(title, mode, rrule);
    const unsubscribe = checklists.subscribe(arr => {
        list = arr.find(l => l.id === id);
    });
    applyAutoReset(id);
    const interval = setInterval(() => applyAutoReset(id), 1000);
    return () => {
        unsubscribe();
        clearInterval(interval);
    };
});

function add(e?: Event) {
    e?.preventDefault();
    if (list && newItem.trim()) {
        addItem(list.id, newItem.trim());
        newItem = "";
    }
}
</script>

<div class="checklist" data-testid="checklist">
    <h2>
        <span class="icon" aria-hidden="true">
            {#if mode === "shopping"}🛒{:else if mode === "packing"}🧳{:else if mode === "habit"}📅{:else}📝{/if}
        </span>
        {title}
    </h2>
    <ul aria-label="Checklist items">
        {#if list}
            {#if list.items.length === 0}
                <li class="empty-state">No items yet. Add one below!</li>
            {:else}
                {#each list.items as item (item.id)}
                    <li>
                        <label class="item-label">
                            <input type="checkbox" checked={item.state === "checked" || item.state === "archived"} onchange={() => toggleItem(list!.id, item.id)} />
                            <span class="item-text" class:completed={item.state === "checked" || item.state === "archived"}>{item.label}</span>
                        </label>
                    </li>
                {/each}
            {/if}
        {/if}
    </ul>
    <form onsubmit={add} class="add-form">
        <input data-testid="add-input" type="text" placeholder="Add new item..." aria-label="Add new item" bind:value={newItem} />
        <button type="submit" data-testid="add-button" disabled={!newItem.trim()} aria-label="Add item">Add</button>
    </form>
    {#if list && list.items.length > 0}
        <div class="footer">
            <button data-testid="reset-button" onclick={() => resetChecklist(list!.id)} class="reset-btn" aria-label="Reset checklist">Reset</button>
        </div>
    {/if}
</div>

<style>
.checklist { width: 100%; max-width: 400px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
:global(html.dark) .checklist { background: #1f2937; border-color: #374151; color: #f3f4f6; }
h2 { font-size: 1.25rem; font-weight: bold; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; color: #1f2937; }
:global(html.dark) h2 { color: #f3f4f6; }
.icon { font-size: 1.5rem; }
ul { list-style: none; padding: 0; margin: 0 0 1rem 0; }
li { margin-bottom: 0.5rem; }
.empty-state { color: #6b7280; font-style: italic; text-align: center; padding: 1rem; background: #f9fafb; border-radius: 6px; }
:global(html.dark) .empty-state { background: #37415180; color: #9ca3af; }
.item-label { display: flex; align-items: center; width: 100%; cursor: pointer; padding: 0.5rem; border-radius: 4px; transition: background 0.2s; }
.item-label:hover { background: #f3f4f6; }
:global(html.dark) .item-label:hover { background: #37415180; }
input[type="checkbox"] { width: 1.25rem; height: 1.25rem; margin-right: 0.75rem; cursor: pointer; }
.item-text { color: #374151; transition: color 0.2s; }
:global(html.dark) .item-text { color: #e5e7eb; }
.item-text.completed { text-decoration: line-through; color: #9ca3af; }
:global(html.dark) .item-text.completed { color: #6b7280; }
.add-form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
input[type="text"] { flex: 1; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem; }
:global(html.dark) input[type="text"] { background: #374151; border-color: #4b5563; color: white; }
button[type="submit"] { background: #2563eb; color: white; font-weight: 500; padding: 0.5rem 1rem; border: none; border-radius: 6px; cursor: pointer; }
button[type="submit"]:hover { background: #1d4ed8; }
button[type="submit"]:disabled { opacity: 0.5; cursor: not-allowed; }
.footer { display: flex; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid #f3f4f6; }
:global(html.dark) .footer { border-top-color: #374151; }
.reset-btn { font-size: 0.75rem; color: #dc2626; background: none; border: none; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 4px; }
.reset-btn:hover { background: #fee2e2; }
:global(html.dark) .reset-btn { color: #f87171; }
:global(html.dark) .reset-btn:hover { background: #7f1d1d33; }
</style>
