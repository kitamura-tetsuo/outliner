<script lang="ts">
import { goto } from '$app/navigation';
import { searchHistoryStore } from '../stores/SearchHistoryStore.svelte';
import type { Project, Items, Item } from '../schema/app-schema';

interface Props { project: Project }
let { project }: Props = $props();

let query = $state('');
let results: Item[] = $state([]);
let history = $derived(searchHistoryStore);
let selected = $state(-1);

function updateResults() {
    if (!query) {
        results = history
            .map(h => (project.items as Items).find(p => p.text === h))
            .filter(Boolean) as Item[];
        selected = results.length ? 0 : -1;
        return;
    }
    const pages = project.items as Items;
    results = [];
    for (const page of pages) {
        if (page.text.toLowerCase().includes(query.toLowerCase())) {
            results.push(page);
        }
    }
    selected = results.length ? 0 : -1;
}

$effect(updateResults);

function handleKeydown(e: KeyboardEvent) {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (results.length) selected = (selected + 1) % results.length;
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (results.length) selected = (selected - 1 + results.length) % results.length;
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selected >= 0 && results[selected]) {
            const title = results[selected].text;
            searchHistoryStore.add(title);
            goto(`/${project.title}/${title}`);
        } else {
            goto(`/search?query=${encodeURIComponent(query)}`);
        }
    }
}
</script>

<div class="page-search-box">
    <input type="text" placeholder="Search pages" bind:value={query} on:keydown={handleKeydown} />
    {#if results.length}
        <ul>
            {#each results as page, i}
                <li class:selected={i === selected}>{page.text}</li>
            {/each}
        </ul>
    {/if}
</div>

<style>
.page-search-box { position: relative; margin-bottom: 1rem; }
.page-search-box ul { position: absolute; z-index: 10; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto; width: 100%; padding:0; margin:0; list-style:none; }
.page-search-box li { padding: 4px 8px; }
.page-search-box li.selected { background: #ddd; }
</style>
