<script lang="ts">
import { getLogger } from "../lib/logger";
const logger = getLogger("SearchPanel");
    import { goto } from "$app/navigation";
    import { resolvePath } from "../utils/pathUtils";
    import { onDestroy, onMount, untrack } from "svelte";
    import { page as pageStore } from "$app/stores";
    import { get } from "svelte/store";
    import { store } from "../stores/store.svelte";
    import {
                replaceAll,
        replaceFirst,
        searchItems,
        type SearchOptions,
    } from "../lib/search";
    import { type PageItemMatch } from "../lib/search/projectSearch";
    import { iterateItems } from "../utils/itemTraversal";
    import { searchHighlightStore } from "../stores/searchHighlightStore.svelte";
    import type { Item, Project } from "../schema/app-schema";

    interface HasText {
        text?: string | { toString(): string };
    }

    interface Props {
        isVisible?: boolean;
        pageItem?: Item | null;
        project?: Project | null;
        onclose?: () => void;
    }

    let {
        isVisible = false,
        pageItem = null,
        project = null,
        onclose,
    }: Props = $props();
    let isTestEnv = $state(false);

    onMount(() => {
        try {
            isTestEnv =
                typeof window !== "undefined" &&
                localStorage.getItem("VITE_IS_TEST") === "true";
        } catch {}
    });

    let matches: Array<PageItemMatch<Item>> = $state([]);

    let searchQuery = $state("");
    let replaceText = $state("");
    let isRegexMode = $state(false);
    let isCaseSensitive = $state(false);

    $effect(() => {
        searchHighlightStore.searchQuery = searchQuery;
        searchHighlightStore.isRegexMode = isRegexMode;
        searchHighlightStore.isCaseSensitive = isCaseSensitive;
    });
    let matchCount = $state(0);
    let inputEl: HTMLInputElement | undefined = $state();

    $effect(() => {
        if (isVisible && inputEl) {
            inputEl.focus();
        }
    });


    function getPagesToSearch(): Item[] {
        // 1) Prioritize project.items
        try {
            const items = project?.items;
            const arr: Item[] = [];
            if (items) {
                for (const p of iterateItems(items)) arr.push(p);
            }
            if (arr.length) return arr;
        } catch {}
        // 2) Fallback to appStore.pages.current or generalStore.pages.current
        try {
            const w = typeof window !== 'undefined' ? (window as Window & typeof globalThis & { appStore?: { pages?: { current?: unknown[] } }, generalStore?: { pages?: { current?: unknown[] } } }) : undefined;
            const gs = typeof window !== 'undefined' ? (w?.appStore || w?.generalStore) : undefined;
            const pages = gs?.pages?.current;
            const arr: Item[] = [];
            if (pages) {
                for (const p of iterateItems(pages)) arr.push(p);
            }
            return arr;
        } catch {
            return [];
        }
    }

    function handleSearch() {
        const options: SearchOptions = {
            regex: isRegexMode,
            caseSensitive: isCaseSensitive,
        };
        const pages = getPagesToSearch();
        try {
            logger.debug("SearchPanel.handleSearch invoked", {
                query: searchQuery,
                pagesLen: pages.length,
            });
        } catch {}

        let newMatches: Array<PageItemMatch<Item>> = [];
        if (pages.length) {
            for (const p of pages) {
                const pageMatches = searchItems(p, searchQuery, options);
                for (const m of pageMatches) {
                    newMatches.push({ ...m, page: p });
                }
            }
        } else if (pageItem) {
            newMatches = searchItems(pageItem, searchQuery, options).map((m) => ({
                ...m,
                page: pageItem!,
            }));
        }

        matches = newMatches;
        matchCount = matches.reduce((c, m) => c + m.matches.length, 0);
        try {
            window.__E2E_LAST_MATCH_COUNT__ = matchCount;
            logger.debug("SearchPanel.handleSearch matches", {
                matchCount,
                items: matches.map((m) => ({
                    page:
                        m.page?.text?.toString?.() ?? String(m.page?.text ?? ""),
                    item:
                        m.item?.text?.toString?.() ?? String(m.item?.text ?? ""),
                })),
            });
        } catch {}

    }

    function handleReplace() {
        const options: SearchOptions = {
            regex: isRegexMode,
            caseSensitive: isCaseSensitive,
        };
        const pages = getPagesToSearch();
        if (pages.length) {
            for (const p of pages) {
                if (replaceFirst(p, searchQuery, replaceText, options)) {
                    handleSearch();
                    return;
                }
            }
        } else if (pageItem) {
            const replaced = replaceFirst(
                pageItem,
                searchQuery,
                replaceText,
                options,
            );
            if (replaced) handleSearch();
        }
    }

    function handleReplaceAll() {
        if (!confirm("Are you sure you want to replace all occurrences? This action cannot be undone.")) return;
        const options: SearchOptions = {
            regex: isRegexMode,
            caseSensitive: isCaseSensitive,
        };
        const pages = getPagesToSearch();
        if (pages.length) {
            for (const p of pages) {
                replaceAll(
                    p,
                    searchQuery,
                    replaceText,
                    options,
                );
            }

            handleSearch();
        } else if (pageItem) {
            replaceAll(pageItem, searchQuery, replaceText, options);
            handleSearch();
        }
    }

    function jumpTo(match: PageItemMatch<Item>) {
        if (!project) return;
        const pageName = encodeURIComponent(
            (match.page.text?.toString?.() ?? String(match.page.text ?? "")) as string,
        );
        const currentPage = get(pageStore);
        if (currentPage.url.pathname.startsWith('/demo')) {
            goto(resolvePath(`/demo/${pageName}`));
        } else {
            const projectTitle = encodeURIComponent(project.title);
            goto(resolvePath(`/${projectTitle}/${pageName}`));
        }
    }

    onDestroy(() => {
        searchHighlightStore.searchQuery = "";
    });

    $effect(() => {
        // React to page changes
        void store.pagesVersion;
        if (searchQuery) {
            untrack(() => handleSearch());
        }
    });

    $effect(() => {
        // Auto-search on input in test environment for stabilization
        if (
            isTestEnv &&
            searchQuery &&
            typeof requestAnimationFrame !== "undefined"
        ) {
            requestAnimationFrame(() => {
                if (searchQuery) handleSearch();
            });
        }
    });
</script>

<svelte:window onkeydown={(e) => { if (isVisible && e.key === 'Escape') onclose?.(); }} />

{#if isVisible}
    <div
        class="search-panel"
        data-testid="search-panel"
        role="region"
        aria-label="Search and Replace"
    >
        <div class="search-panel-header">
            <h3>Search and Replace</h3>
        </div>

        <section class="search-panel-content" aria-label="Search and Replace">
            <div class="search-input-group">
                <label for="search-input">Search:</label>
                <input
                    id="search-input"
                    type="text"
                    bind:this={inputEl}
                    bind:value={searchQuery}
                    placeholder="Enter search term"
                    class="search-input"
                    data-testid="search-input"
                />
                <button type="button"
                    onclick={handleSearch}
                    class="search-btn-action"
                    data-testid="search-button">Search</button
                >
            </div>

            <div class="replace-input-group">
                <label for="replace-input">Replace:</label>
                <input
                    id="replace-input"
                    type="text"
                    bind:value={replaceText}
                    placeholder="Enter replacement term"
                    class="replace-input"
                    data-testid="replace-input"
                />
                <button type="button"
                    onclick={handleReplace}
                    class="replace-btn"
                    data-testid="replace-button">Replace</button
                >
                <button type="button"
                    onclick={handleReplaceAll}
                    class="replace-all-btn"
                    data-testid="replace-all-button">Replace All</button
                >
            </div>

            <div class="search-options">
                <label class="option-checkbox">
                    <input type="checkbox" bind:checked={isRegexMode} />
                    Regex
                </label>
                <label class="option-checkbox">
                    <input type="checkbox" bind:checked={isCaseSensitive} />
                    Case Sensitive
                </label>
            </div>

            <div class="search-results" data-testid="search-results">
                <p data-testid="search-results-hits">Hits: {matchCount}</p>
                <ul data-testid="search-results-list">
                    {#each matches as m (`${m.page.id}-${m.item.id}`)}
                        <li
                            class="result-item"
                            data-testid="search-result-item"
                        >
                            <button type="button"
                                class="result-button"
                                data-testid="search-result-button"
                                onclick={() => jumpTo(m)}
                            >
                                <span
                                    class="result-page"
                                    data-testid="search-result-page"
                                    >{(m.page as unknown as HasText).text?.toString?.() ??
                                        String(
                                            (m.page as unknown as HasText).text ?? "",
                                        )}</span
                                >
                                -
                                <span
                                    class="result-snippet"
                                    data-testid="search-result-snippet"
                                    >{(m.item as unknown as HasText).text?.toString?.() ??
                                        String(
                                            (m.item as unknown as HasText).text ?? "",
                                        )}</span
                                >
                            </button>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>
    </div>
{/if}

<style>
    .search-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 500px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
    }

    .search-panel-header {
        padding: 12px 16px;
        border-bottom: 1px solid #eee;
        background: #f8f9fa;
        border-radius: 8px 8px 0 0;
    }

    .search-panel-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
    }

    .search-panel-content {
        padding: 16px;
    }

    .search-input-group,
    .replace-input-group {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
    }

    .search-input-group label,
    .replace-input-group label {
        min-width: 50px;
        font-size: 14px;
        color: #555;
    }

    .search-input,
    .replace-input {
        flex: 1;
        min-width: 0;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
    }

    .search-input:focus,
    .replace-input:focus {
        outline: none;
        border-color: #0078d7;
        box-shadow: 0 0 0 2px rgba(0, 120, 215, 0.2);
    }

    .search-btn-action,
    .replace-btn,
    .replace-all-btn {
        padding: 8px 16px;
        border: 1px solid #0078d7;
        background: #0078d7;
        color: white;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.2s;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .search-btn-action:hover,
    .replace-btn:hover,
    .replace-all-btn:hover {
        background: #106ebe;
    }

    .replace-all-btn {
        background: #d83b01;
        border-color: #d83b01;
    }

    .replace-all-btn:hover {
        background: #c13a00;
    }

    .search-options {
        display: flex;
        gap: 16px;
        margin-top: 12px;
    }

    .option-checkbox {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        color: #555;
        cursor: pointer;
    }

    .option-checkbox input[type="checkbox"] {
        margin: 0;
    }

    :global(.search-highlight) {
        background-color: #fff3cd;
        padding: 0 2px;
        border-radius: 2px;
    }

    .search-results ul {
        list-style: none;
        padding: 0;
        margin-top: 10px;
        max-height: 200px;
        overflow: auto;
    }

    .result-item {
        padding: 4px 0;
    }

    .result-item:hover {
        background: #f0f0f0;
    }

    .result-button {
        background: none;
        border: none;
        width: 100%;
        text-align: left;
        padding: 4px 0;
        cursor: pointer;
    }

    .result-button:hover {
        background: #f0f0f0;
    }

    .result-page {
        font-weight: bold;
    }
</style>
