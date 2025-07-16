<script lang="ts">
import { goto } from '$app/navigation';
import type { Item, Items, Project } from '../schema/app-schema';
import { searchHistoryStore } from '../stores/SearchHistoryStore.svelte';

interface Props { project: Project }
let { project }: Props = $props();

let query = $state('');
let selected = $state(-1);
let isFocused = $state(false);

// リアクティブに結果を計算
let results = $derived.by(() => {
    if (!project?.items) {
        return [];
    }

    const pages = project.items as Items;

    if (!query) {
        const historyResults = searchHistoryStore.history
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
        return historyResults;
    }

    const searchResults: Item[] = [];
    for (let i = 0; i < pages.length; i++) {
        const page = pages.at(i);
        if (page && page.text.toLowerCase().includes(query.toLowerCase())) {
            searchResults.push(page);
        }
    }
    return searchResults;
});

// 結果が変更されたときにselectedを更新
$effect(() => {
    selected = results.length ? 0 : -1;
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
        navigateToPage();
    }
}

function navigateToPage(page?: Item) {
    const targetPage = page || (selected >= 0 && results[selected] ? results[selected] : null);
    if (targetPage) {
        const title = targetPage.text;
        searchHistoryStore.add(title);
        goto(`/${project.title}/${title}`);
    } else if (query) {
        goto(`/search?query=${encodeURIComponent(query)}`);
    }
}

function handlePageClick(page: Item) {
    navigateToPage(page);
}
</script>

<div class="page-search-box">
    <input
        type="text"
        placeholder="Search pages"
        bind:value={query}
        onkeydown={handleKeydown}
        onfocus={() => (isFocused = true)}
        onblur={() => (isFocused = false)}
    />
    {#if results.length && isFocused}
        <ul>
            {#each results as page, i}
                <li class:selected={i === selected}>
                    <button type="button" onclick={() => handlePageClick(page)}>{page.text}</button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
.page-search-box {
    position: relative;
    width: 100%;
    max-width: 400px;
}

.page-search-box input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
}

.page-search-box input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.page-search-box ul {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1100;
    background: white;
    border: 1px solid #d1d5db;
    border-top: none;
    border-radius: 0 0 0.375rem 0.375rem;
    max-height: 200px;
    overflow-y: auto;
    padding: 0;
    margin: 0;
    list-style: none;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.page-search-box li {
    padding: 0;
}

.page-search-box li.selected {
    background: #eff6ff;
}

.page-search-box li button {
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.75rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.875rem;
    color: #374151;
}

.page-search-box li button:hover {
    background: #f3f4f6;
}

.page-search-box li.selected button {
    background: #eff6ff;
    color: #1d4ed8;
}
</style>
