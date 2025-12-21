<script lang="ts">
import { goto } from '$app/navigation';
import type { Project } from '../schema/app-schema';
import type { ItemLike } from '../types/yjs-types';
import { searchHistoryStore } from '../stores/SearchHistoryStore.svelte';
import { onMount } from 'svelte';
import { store } from '../stores/store.svelte';

// Type alias for backward compatibility
type Item = ItemLike;

interface Props { project?: Project }
let { project }: Props = $props();

// Resolve project from multiple sources for robustness in tests
let effectiveProject: Project | null = $derived.by(() => {
    const fromProps = project ?? (store.project ?? null);
    if (fromProps) return fromProps;
    if (typeof window !== 'undefined') {
        const cur = window.__CURRENT_PROJECT__;
        if (cur) return cur;
        const gs = window.generalStore;
        if (gs?.project) return gs.project;
        const parts = window.location.pathname.split("/").filter(Boolean);
        void parts[0]; // Previously projectTitle
        void window.__YJS_SERVICE__; // Previously service
        void window.__YJS_STORE__; // Previously yjsStoreRef
        // Do NOT auto-create a project here. In tests this can create an empty
        // project separate from the one prepared by TestHelpers, which breaks
        // SearchBox results. Wait for store.project or global state instead.
        // Keeping this block as a no-op fallback only.
    }
    return null;
});

let query = $state('');
let selected = $state(-1);
let inputEl: HTMLInputElement | null = null;
// Preserve focus across reactive project changes to keep dropdown stable in tests
let shouldRefocus = $state(false);
// Micro-sync tick to retrigger results during early init so that fallback pages populate
let refreshTick = $state(0);


// リアクティブに結果を計算
let results = $derived.by(() => {
    // include refreshTick as a reactive dependency to re-evaluate during init
    void refreshTick;

    let projectToUse: Project | null = effectiveProject;
    if (!projectToUse && typeof window !== 'undefined') {
        // try global fallbacks
        const cur = window.__CURRENT_PROJECT__;
        if (cur) projectToUse = cur;
    }

    // Resolve pages robustly. Prefer a non-empty store.pages.current, otherwise
    // fall back to project.items. Reading from `store` ensures reactivity when
    // pages load after the user begins typing.
    const collectPages = (): Item[] => {
        const sources = [
            // Primary: store.pages.current (reactive to Yjs changes)
            () => store.pages?.current,
            // Fallback 1: effectiveProject.items
            () => effectiveProject?.items,
            // Fallback 2: projectToUse.items
            () => projectToUse?.items,
            // Fallback 3: window.generalStore.project.items
            () => typeof window !== 'undefined' ? window.generalStore?.project?.items : undefined,
            // Fallback 4: window.appStore.project.items
            () => typeof window !== 'undefined' ? window.appStore?.project?.items : undefined,
        ];

        for (const getSource of sources) {
            try {
                const items = getSource();
                if (!items) continue;

                const arr: Item[] = [];

                // Try iterator first
                if (typeof items[Symbol.iterator] === 'function') {
                    for (const p of items) {
                        if (p) arr.push(p);
                    }
                    if (arr.length) return arr;
                }

                // Try array-like access
                if (typeof (items as { length?: number }).length === 'number') {
                    const len = (items as { length: number }).length;
                    for (let i = 0; i < len; i++) {
                        const v = (items as { at?: (i: number) => Item; [key: number]: Item }).at
                            ? (items as { at: (i: number) => Item }).at(i)
                            : (items as { [key: number]: Item })[i];
                        if (typeof v !== 'undefined' && v !== null) arr.push(v);
                    }
                    if (arr.length) return arr;
                }

                // Try toArray method if available
                if (typeof (items as { toArray?: () => Item[] }).toArray === 'function') {
                    const arr = (items as { toArray: () => Item[] }).toArray();
                    if (arr && arr.length) return arr;
                }
            } catch {
                // Continue to next source
                continue;
            }
        }

        return [];
    };

    const pagesArr = collectPages();
    if (!pagesArr.length) return [];

    if (!query) {
        const historyResults = searchHistoryStore.history
            .map(h => {
                for (let i = 0; i < pagesArr.length; i++) {
                    const page = pagesArr[i];
                    const title = page?.text?.toString?.() ?? '';
                    if (page && title === h) return page;
                }
                return null;
            })
            .filter(Boolean) as Item[];
        return historyResults;
    }

    const searchResults: Item[] = [];
    for (let i = 0; i < pagesArr.length; i++) {
        const page = pagesArr[i];
        const title = page?.text?.toString?.() ?? '';
        if (page && title.toLowerCase().includes(query.toLowerCase())) {
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

function resolveProjectTitle(targetPage: Item | null): string {
    const storeProject = store.project ?? null;
    const derivedProject = effectiveProject ?? null;
    const pageDoc = targetPage?.ydoc ?? null;
    const projectMatches = (proj: Project | null) => {
        if (!proj) return false;
        const projDoc = proj.ydoc ?? null;
        if (pageDoc && projDoc && projDoc !== pageDoc) return false;
        if (derivedProject && projDoc && derivedProject.ydoc && projDoc !== derivedProject.ydoc) {
            return false;
        }
        return true;
    };

    // Prefer derivedProject (effectiveProject) first, as it includes the most recent project state
    if (derivedProject && projectMatches(derivedProject)) return derivedProject.title ?? "";
    const preferred = projectMatches(storeProject) ? storeProject : null;
    if (preferred) return preferred.title ?? "";
    if (derivedProject) return derivedProject.title ?? "";
    if (storeProject) return storeProject.title ?? "";
    return "";
}

function navigateToPage(page?: Item) {
    const targetPage = page || (selected >= 0 && results[selected] ? results[selected] : null);
    if (targetPage) {
        const title = targetPage.text ?? "";
        searchHistoryStore.add(title);
        // Prefer a project whose Y.Doc matches the active page/project before falling back to placeholders
        let projTitle = resolveProjectTitle(targetPage);
        if (!projTitle && typeof window !== 'undefined') {
            const cur = window.__CURRENT_PROJECT__;
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

// Debug mount to verify presence during E2E and schedule micro-sync ticks
onMount(() => {
    try {
        const logPrefix = "[SEA-0001][SearchBox]";
        const styles = (el: Element | null) => {
            if (!el) return null;
            const cs = getComputedStyle(el as Element);
            return {
                display: cs.display,
                visibility: cs.visibility,
                opacity: cs.opacity,
                transform: cs.transform,
                clipPath: (cs as { [key: string]: unknown })["clipPath"] ?? (cs as { [key: string]: unknown })["clip-path"],
                pointerEvents: cs.pointerEvents,
            };
        };
        const rect = inputEl?.getBoundingClientRect?.();
        const e20 = document.elementFromPoint?.(20, 20) as Element | null;
        // 可視性の追加チェック（Playwright に近い指標）
        const clientRectsCount = inputEl?.getClientRects?.().length ?? 0;
        const inDOM = !!(inputEl && document.contains(inputEl));
        const bboxNonZero = !!(rect && rect.width > 0 && rect.height > 0);
        const vw = window.innerWidth, vh = window.innerHeight;
        const viewportIntersect = !!(rect && rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh);
        const cx = rect ? Math.max(0, Math.min(vw - 1, rect.left + Math.min(rect.width - 1, 5))) : 0;
        const cy = rect ? Math.max(0, Math.min(vh - 1, rect.top + Math.min(rect.height - 1, Math.floor(rect.height/2)))) : 0;
        const eCenter = (rect ? document.elementFromPoint?.(cx, cy) : null) as Element | null;
        const eCenterInfo = eCenter ? { tag: eCenter.tagName, id: (eCenter as HTMLElement).id, cls: (eCenter as HTMLElement).className } : null;
        console.info(logPrefix, "mount",
            {
                inputReady: !!inputEl,
                inputRect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null,
                at20x20: e20 ? { tag: e20.tagName, id: (e20 as HTMLElement).id, cls: (e20 as HTMLElement).className } : null,
                atCenter: eCenterInfo,
                clientRectsCount,
                inDOM,
                bboxNonZero,
                viewportIntersect,
                inputStyles: styles(inputEl as Element),
            }
        );
        // 親チェーンの computed styles を上位へ辿って計測
        type ChainInfo = {
            tag: string;
            id: string;
            cls: string;
            styles: ReturnType<typeof styles>;
        };
        const chain: ChainInfo[] = [];
        let node: HTMLElement | null = inputEl;
        const limit = 15;
        let count = 0;
        while (node && count < limit) {
            chain.push({
                tag: node.tagName,
                id: node.id,
                cls: node.className,
                styles: styles(node),
            });
            node = node.parentElement;
            count++;
        }
        console.info(logPrefix, "ancestor-styles", chain);
        const toolbar = document.querySelector('[data-testid="main-toolbar"]') as HTMLElement | null;
        console.info(logPrefix, "main-toolbar styles", styles(toolbar));
    } catch {}
    // schedule a few ticks to help early reactivity with global generalStore
    for (let i = 0; i < 8; i++) setTimeout(() => (refreshTick += 1), i * 50);
});
</script>

<div class="page-search-box">

    <label id="search-pages-label" for="search-pages-input" class="visually-hidden">Search pages</label>
    <input
        type="text"
        aria-hidden="false"
        aria-label="Search pages"
        aria-labelledby="search-pages-label"
        placeholder="Search pages"
        data-testid="search-pages-input"
        id="search-pages-input"
        bind:this={inputEl}
        bind:value={query}
        onkeydown={handleKeydown}
        onfocus={() => { shouldRefocus = true; }}
        oninput={() => { shouldRefocus = true; }}
        onblur={() => {
            // Keep focus while user is interacting with the search suggestions in tests
            // Outliner may steal focus to the global textarea; when query is non-empty,
            // immediately restore focus to this input so Arrow keys/Enter work as expected.
            if (query && query.length > 0) {
                shouldRefocus = true;
                queueMicrotask(() => inputEl?.focus());
            }
        }}
    />
    {#if query.length > 0}
        <button
            type="button"
            class="clear-button"
            aria-label="Clear search"
            onclick={() => { query = ''; }}
        >
            &times;
        </button>
    {/if}
    {#if query.length > 0 && results.length === 0}
        <div class="no-results" role="status">No results found</div>
    {/if}
    {#if results.length && (query.length > 0)}
        <ul>
            {#each results as page, i (page.id)}
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
    width: 340px;
    padding: 0.5rem 0.75rem;
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
    right: 60px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.25rem;
    color: #9ca3af;
    padding: 0.25rem;
    line-height: 1;
}

.clear-button:hover {
    color: #6b7280;
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
