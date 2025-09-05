<script lang="ts">
import { goto } from '$app/navigation';
import type { Item, Items, Project } from '../schema/app-schema';
import { searchHistoryStore } from '../stores/SearchHistoryStore.svelte';
import { store } from '../stores/store.svelte';
import { fluidStore } from '../stores/fluidStore.svelte';

interface Props { project?: Project }
let { project }: Props = $props();

// Resolve project from multiple sources for robustness in tests
let effectiveProject: Project | null = $derived.by(() => {
    return project
        ?? (store.project ?? null)
        ?? (fluidStore.fluidClient ? fluidStore.fluidClient.getProject() : null);
});

let query = $state('');
let selected = $state(-1);
let isFocused = $state(false);
let inputEl: HTMLInputElement | null = null;
// Preserve focus across reactive project changes to keep dropdown stable in tests
let shouldRefocus = $state(false);

// リアクティブに結果を計算
let results = $derived.by(() => {
    let projectToUse: Project | null = effectiveProject;
    if (!projectToUse && typeof window !== 'undefined') {
        // try global fallbacks
        const cur = (window as any).__CURRENT_PROJECT__ as Project | undefined;
        if (cur) projectToUse = cur;
        else {
            const reg = (window as any).__FLUID_CLIENT_REGISTRY__;
            const keys = reg?.getAllKeys?.() ?? [];
            if (keys.length) {
                const last = keys[keys.length - 1];
                const inst = reg.get(last);
                const proj = inst?.[4];
                if (proj) projectToUse = proj;
            }
        }
    }

    // Resolve pages from project or global store as a robust fallback
    // NOTE: We must search page TITLES, which live under project.items, not the current page's items
    let pages: Items | any[] | undefined = projectToUse?.items as Items | undefined;
    if (!pages && typeof window !== 'undefined') {
        const gs = (window as any).generalStore;
        const projectItems = gs?.project?.items;
        if (projectItems) pages = projectItems as any[];
    }

    if (!pages) return [];

    if (!query) {
        const historyResults = searchHistoryStore.history
            .map(h => {
                // Items配列から検索
                const len = (pages as any).length ?? 0;
                for (let i = 0; i < len; i++) {
                    const page = (pages as any).at ? (pages as any).at(i) : (pages as any)[i];
                    const title = page?.text?.toString?.() ?? '';
                    if (page && title === h) {
                        return page;
                    }
                }
                return null;
            })
            .filter(Boolean) as Item[];
        return historyResults;
    }

    const searchResults: Item[] = [];
    const len = (pages as any).length ?? 0;
    for (let i = 0; i < len; i++) {
        const page = (pages as any).at ? (pages as any).at(i) : (pages as any)[i];
        const title = page?.text?.toString?.() ?? '';
        if (page && title.toLowerCase().includes(query.toLowerCase())) {
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
        const title = (targetPage as any)?.text?.toString?.() ?? String((targetPage as any)?.text ?? "");
        searchHistoryStore.add(title);
        let projTitle = effectiveProject?.title ?? '';
        if (!projTitle && typeof window !== 'undefined') {
            const cur = (window as any).__CURRENT_PROJECT__ as Project | undefined;
            projTitle = cur?.title ?? projTitle;
            if (!projTitle) {
                const pathParts = window.location.pathname.split("/").filter(Boolean);
                projTitle = pathParts[0] ? decodeURIComponent(pathParts[0]) : '';
            }
        }
        // Encode path segments to ensure correct routing for titles with spaces/special characters
        goto(`/${encodeURIComponent(projTitle)}/${encodeURIComponent(title)}`);
    } else if (query) {
        goto(`/search?query=${encodeURIComponent(query)}`);
    }
}

function handlePageClick(page: Item) {
    navigateToPage(page);
}

// When effectiveProject changes during initialization, refocus the input
// if the user had already focused/typed, so the dropdown can render.
$effect(() => {
    // read dependency to trigger on project resolution
    void effectiveProject;
    if (shouldRefocus && inputEl) {
        queueMicrotask(() => inputEl?.focus());
    }
});
</script>

<div class="page-search-box">
    <input
        type="text"
        placeholder="Search pages"
        bind:this={inputEl}
        bind:value={query}
        onkeydown={handleKeydown}
        onfocus={() => { isFocused = true; shouldRefocus = true; }}
        oninput={() => { isFocused = true; shouldRefocus = true; }}
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
