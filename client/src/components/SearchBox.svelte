<script lang="ts">
import { goto } from '$app/navigation';
import type { Item, Items, Project } from '../schema/app-schema';
import { searchHistoryStore } from '../stores/SearchHistoryStore.svelte';

interface Props { project: Project }
let { project }: Props = $props();

let query = $state('');
let results: Item[] = $state([]);
let history: string[] = $state([]);
let selected = $state(-1);

// SearchHistoryStoreの値を監視
$effect(() => {
    const unsubscribe = searchHistoryStore.subscribe(value => {
        history = value;
    });
    return unsubscribe;
});

function updateResults() {
    if (!project?.items) {
        results = [];
        selected = -1;
        return;
    }

    const pages = project.items as Items;

    if (!query) {
        results = history
            .map(h => {
                // Items配列から検索
                for (let i = 0; i < pages.length; i++) {
                    const page = pages.at(i);
                    if (page && page.text === h) {
                        return page;
                    }
                }
                return null;
            })
            .filter(Boolean) as Item[];
        selected = results.length ? 0 : -1;
        return;
    }

    results = [];
    for (let i = 0; i < pages.length; i++) {
        const page = pages.at(i);
        if (page && page.text.toLowerCase().includes(query.toLowerCase())) {
            results.push(page);
        }
    }
    selected = results.length ? 0 : -1;
}

// プロジェクトとクエリの変更を監視
$effect(() => {
    updateResults();
});

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
            // Temporarily disabled for testing
            goto(`/${project.title}/${title}`);
        } else {
            // Temporarily disabled for testing
            goto(`/search?query=${encodeURIComponent(query)}`);
        }
    }
}
</script>

<div class="page-search-box">
    <input type="text" placeholder="Search pages" bind:value={query} onkeydown={handleKeydown} />
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
