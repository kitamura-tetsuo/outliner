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

function add() {
    if (list && newItem.trim()) {
        addItem(list.id, newItem.trim());
        newItem = "";
    }
}
</script>

<div class="checklist" data-testid="checklist">
    <h2>{title}</h2>
    <ul>
        {#if list}
            {#each list.items as item (item.id)}
                <li>
                    <label>
                        <input
                            type="checkbox"
                            checked={item.state === "checked" || item.state === "archived"}
                            onchange={() => toggleItem(list!.id, item.id)}
                        />
                        {item.label}
                    </label>
                </li>
            {/each}
        {/if}
    </ul>
    <input
        data-testid="add-input"
        placeholder="Add item"
        bind:value={newItem}
        onkeydown={e => e.key === "Enter" && add()}
    />
    <button data-testid="add-button" onclick={add}>Add</button>
    {#if list}
        <button data-testid="reset-button" onclick={() => resetChecklist(list!.id)}>Reset</button>
    {/if}
</div>

<style>
.checklist {
    max-width: 400px;
}
</style>
