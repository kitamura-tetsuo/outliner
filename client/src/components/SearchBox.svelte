<script module>
    export let searchBoxCounter = 0;
</script>

<script lang="ts">
    const componentId = `search-box-${searchBoxCounter++}`;

import { getLogger } from "../lib/logger";
const logger = getLogger("SearchBox");
    import { goto } from "$app/navigation";
    import { resolvePath } from "../utils/pathUtils";
    import type { Project } from "../schema/app-schema";
    import type { ItemLike } from "../types/yjs-types";
    import { searchHistoryStore } from "../stores/SearchHistoryStore.svelte";
    import { store } from "../stores/store.svelte";
    import { iterateItems } from "../utils/itemTraversal";
    import { projectPagePath } from "../lib/publicProject";

    // Type alias for backward compatibility
    type Item = ItemLike;

    interface Props {
        project?: Project;
    }
    let { project }: Props = $props();

    let effectiveProject: Project | null = $derived.by(() => {
        return project ?? store.project ?? null;
    });

    let query = $state("");
    let debouncedQuery = $state("");
    let selected = $state(-1);
    let inputEl: HTMLInputElement | null = null;
    let isFocused = $state(false);
    // Preserve focus across reactive project changes to keep dropdown stable in tests
    let shouldRefocus = $state(false);
    // Micro-sync tick to retrigger results during early init so that fallback pages populate
    let refreshTick = $state(0);

    // Debounce query updates to avoid blocking the main thread on every keystroke
    $effect(() => {
        if (!query) {
            debouncedQuery = "";
            return;
        }
        const handler = setTimeout(() => {
            debouncedQuery = query;
        }, 200);
        return () => clearTimeout(handler);
    });

    let containerEl: HTMLDivElement | null = null;

    // Calculate results reactively
    let results = $derived.by(() => {
        // include refreshTick as a reactive dependency to re-evaluate during init
        void refreshTick;

        let projectToUse: Project | null = effectiveProject;

        // Resolve pages robustly. Prefer a non-empty store.pages.current, otherwise
        // fall back to project.items. Reading from `store` ensures reactivity when
        // pages load after the user begins typing.
        const collectPages = (): Item[] => {
            const sources = [
                () => {
                    void store.pagesVersion;
                    return store.pages?.current;
                },
                // Fallback 1: effectiveProject.items
                () => effectiveProject?.items,
                // Fallback 2: projectToUse.items
                () => projectToUse?.items,
            ];

            for (const getSource of sources) {
                try {
                    const items = getSource();
                    if (!items) continue;

                    const arr: Item[] = [];

                    // Try iterator first
                    if (typeof items[Symbol.iterator] === "function") {
                        for (const p of iterateItems(items)) {
                            if (p) arr.push(p);
                        }
                        if (arr.length) {
                            if (
                                import.meta.env.MODE === "test"
                            ) {
                                logger.debug(
                                    "[SearchBox Debug] Source found items:",
                                    arr.map((p) => p.text),
                                );
                            }
                            return arr;
                        }
                    }

                    // Try array-like access
                    const typedItems = items as unknown as { length?: number; at?: (i: number) => unknown; toArray?: () => unknown[]; [key: number]: unknown; };

                    if (typeof typedItems.length === "number") {
                        const len = typedItems.length;
                        for (let i = 0; i < len; i++) {
                            const v = typeof typedItems.at === "function" ? typedItems.at(i) : typedItems[i];
                            if (typeof v !== "undefined" && v !== null)
                                arr.push(v as import("../schema/app-schema").Item);
                        }
                        if (arr.length) return arr;
                    }

                    // Try toArray method if available
                    if (typeof typedItems.toArray === "function") {
                        const parsedArr = typedItems.toArray();
                        if (parsedArr && parsedArr.length) {
                            for (const item of parsedArr) {
                                arr.push(item as import("../schema/app-schema").Item);
                            }
                            return arr;
                        }
                    }
                } catch {
                    // Continue to next source
                    continue;
                }
            }

            if (import.meta.env.MODE === "test") {
                logger.debug(
                    "[SearchBox Debug] collectPages found NO items. Sources tried:",
                    sources.length,
                );
                logger.debug("[SearchBox Debug] Store state:", {
                    project: !!store.project,
                    projectItems: store.project?.items?.length,
                    pagesCurrent: store.pages?.current?.length,
                });
            }
            return [];
        };

        const pagesArr = collectPages();

        if (!pagesArr.length) return [];

        if (!debouncedQuery) {
            const historyResults = searchHistoryStore.history
                .map((h) => {
                    for (let i = 0; i < pagesArr.length; i++) {
                        const page = pagesArr[i];
                        const title = page?.text?.toString?.() ?? "";
                        if (page && title === h) return page;
                    }
                    return null;
                })
                .filter(Boolean) as Item[];
            return historyResults;
        }

        const searchResults: Item[] = [];
        const lowerQuery = debouncedQuery.toLowerCase();
        for (let i = 0; i < pagesArr.length; i++) {
            const page = pagesArr[i];
            const title = page?.text?.toString?.() ?? "";
            if (page && title.toLowerCase().includes(lowerQuery)) {
                searchResults.push(page);
            }
        }
        return searchResults;
    });

    // Reset selected when results change
    // Note: This $effect is necessary because selected needs to be both:
    // 1. Reactive to results changes (reset when results change)
    // 2. Mutable by user interaction (arrow key navigation)
    // This is a valid use case for $effect in Svelte 5
    $effect(() => {
        selected = results.length ? 0 : -1;
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.isComposing) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (results.length) selected = (selected + 1) % results.length;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (results.length)
                selected = (selected - 1 + results.length) % results.length;
        } else if (e.key === "Enter") {
            e.preventDefault();
            navigateToPage();
        }
    }

    function resolveProjectTitle(targetPage: Item | null): string {
        const storeProject = store.project ?? null;
        const derivedProject = effectiveProject ?? null;
        const pageDoc = targetPage?.ydoc ?? null;
        const projectMatches = (proj: Project | null) => {
            if (!proj) return false;
            const projDoc = proj.ydoc ?? null;
            if (pageDoc && projDoc && projDoc !== pageDoc) return false;
            if (
                derivedProject &&
                projDoc &&
                derivedProject.ydoc &&
                projDoc !== derivedProject.ydoc
            ) {
                return false;
            }
            return true;
        };

        // Prefer derivedProject (effectiveProject) first, as it includes the most recent project state
        if (derivedProject && projectMatches(derivedProject))
            return derivedProject.title ?? "";
        const preferred = projectMatches(storeProject) ? storeProject : null;
        if (preferred) return preferred.title ?? "";
        if (derivedProject) return derivedProject.title ?? "";
        if (storeProject) return storeProject.title ?? "";
        return "";
    }

    function navigateToPage(page?: Item) {
        // If query has changed but results haven't updated yet, treat results as stale
        const isStale = query !== debouncedQuery;

        const targetPage =
            page ||
            (!isStale && selected >= 0 && results[selected]
                ? results[selected]
                : null);
        if (targetPage) {
            const title = targetPage.text ?? "";
            searchHistoryStore.add(title);
            // Prefer a project whose Y.Doc matches the active page/project before falling back to placeholders
            let projTitle = resolveProjectTitle(targetPage);
            // Encode path segments to ensure correct routing for titles with spaces/special characters
            // `projTitle` is already the demo's own slug when we are in a demo,
            // so no special case is needed. The pathname test that used to be
            // here also matched `/demo-ja`, sending those visitors to `/demo`.
            goto(resolvePath(projectPagePath(projTitle, title)));
        } else if (query) {
            goto(resolvePath(`/search?query=${encodeURIComponent(query)}`));
        }
    }

    function handlePageClick(page: Item) {
        isFocused = false;
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

<div class="page-search-box" bind:this={containerEl} onfocusout={(e) => {
    if (!containerEl?.contains(e.relatedTarget as Node)) {
        isFocused = false;
    }
}}>
    <label
        id={`search-pages-label-${componentId}`}
        for={`search-pages-input-${componentId}`}
        class="visually-hidden">Search pages</label
    >
    <svg
        class="search-icon"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
    </svg>
    <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={query.length > 0 && results.length > 0}
        aria-controls={`search-results-listbox-${componentId}`}
        aria-activedescendant={selected >= 0 ? `search-result-item-${componentId}-${selected}` : undefined}
        aria-hidden="false"
        aria-label="Search pages"
        placeholder="Search pages"
        data-testid="search-pages-input"
        id={`search-pages-input-${componentId}`}
        bind:this={inputEl}
        bind:value={query}
        onkeydown={handleKeydown}
        onfocus={(e) => {
            shouldRefocus = true;
            isFocused = true;
            if (e.target && "value" in e.target && e.target.value !== query) {
                query = e.target.value as string;
            }
        }}
        oninput={() => {
            shouldRefocus = true;
        }}
    />
    {#if query.length > 0}
        <button type="button"
            class="clear-button"
            aria-label="Clear search"
            title="Clear search"
            onclick={() => {
                query = "";
                inputEl?.focus();
            }}
            onpointerdown={(e) => e.preventDefault()}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                class="clear-icon"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
            >
                <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                />
            </svg>
        </button>
    {/if}
    {#if isFocused && query.length > 0 && results.length === 0}
        <div class="no-results" role="status">No results found</div>
    {/if}
    {#if isFocused && results.length && query.length > 0}
        <ul id={`search-results-listbox-${componentId}`} role="listbox">
            {#each results as page, i (page.id)}
                <li
                    id={`search-result-item-${componentId}-${i}`}
                    role="option"
                    aria-selected={i === selected}
                    class:selected={i === selected}
                >
                    <button type="button"
                        onclick={() => handlePageClick(page)}
                        onpointerdown={(e) => e.preventDefault()}
                        tabindex="-1"
                        aria-label={`Go to page ${page.text.trimEnd()}`}
                        >{page.text.trimEnd()}</button
                    >
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
        min-width: 0;
    }

    .search-icon {
        position: absolute;
        left: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        width: 1rem;
        height: 1rem;
        color: #6b7280;
        pointer-events: none;
        z-index: 10;
    }

    .page-search-box input {
        width: 100%;
        min-width: 0;
        padding: 0.5rem 2.25rem 0.5rem 2.25rem;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        background: white;
        /* place naturally within toolbar content for stable visibility */
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
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

    /* screen-reader friendly label style without clipping */
    .visually-hidden {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        padding: 0 !important;
        margin: -1px !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        border: 0 !important;
    }

    .clear-button {
        position: absolute;
        right: 4px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        cursor: pointer;
        color: #6b7280;
        padding: 0.25rem;
        border-radius: 9999px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out;
    }

    .clear-button:hover {
        color: #4b5563;
        background-color: #f3f4f6;
    }

    .clear-button:focus-visible {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
    }

    .clear-icon {
        width: 1.25rem;
        height: 1.25rem;
    }

    .no-results {
        padding: 0.5rem 0.75rem;
        color: #6b7280;
        font-size: 0.875rem;
        background: white;
        border: 1px solid #d1d5db;
        border-top: none;
        border-radius: 0 0 0.375rem 0.375rem;
    }
</style>
