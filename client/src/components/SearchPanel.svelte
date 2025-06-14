<script lang="ts">
import {
    replaceAll,
    searchItems,
    type SearchOptions,
} from "$lib/search";
import {
    onDestroy,
    onMount,
} from "svelte";
import { store } from "../stores/store.svelte";

let isOpen = $state(false);
let query = $state("");
let replaceText = $state("");
let useRegex = $state(false);
let resultsCount = $state(0);

let searchInput: HTMLInputElement | null = null;

function close() {
    isOpen = false;
}

async function runSearch() {
    if (!store.project) return;
    const opts: SearchOptions = { regex: useRegex };
    const matches = await searchItems(store.project, query, opts);
    resultsCount = matches.length;
    (window as any).searchResultsCount = resultsCount;
}

async function runReplaceAll() {
    if (!store.project) return;
    const opts: SearchOptions = { regex: useRegex };
    const count = await replaceAll(store.project, query, replaceText, opts);
    resultsCount = count;
}

function onKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        isOpen = true;
        setTimeout(() => searchInput?.focus(), 0);
    }
    if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        close();
    }
}

onMount(() => {
    document.addEventListener("keydown", onKeydown);
});

onDestroy(() => {
    document.removeEventListener("keydown", onKeydown);
});
</script>

{#if isOpen}
    <div class="search-panel" data-testid="search-panel">
        <input
            bind:this={searchInput}
            class="search-input"
            placeholder="Search"
            bind:value={query}
            on:keydown={e => e.key === "Enter" && runSearch()}
        />
        <input
            class="replace-input"
            placeholder="Replace"
            bind:value={replaceText}
            on:keydown={e => e.key === "Enter" && runReplaceAll()}
        />
        <label><input type="checkbox" bind:checked={useRegex} />Regex</label>
        <button class="replace-all-btn" onclick={runReplaceAll}>Replace All</button>
        <span class="result-count">{resultsCount}</span>
    </div>
{/if}

<style>
.search-panel {
    position: fixed;
    top: 10px;
    right: 10px;
    background: white;
    border: 1px solid #ccc;
    padding: 8px;
    z-index: 1000;
    display: flex;
    gap: 4px;
}
.search-input,
.replace-input {
    border: 1px solid #ccc;
    padding: 4px;
}
</style>
