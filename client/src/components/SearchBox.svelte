<script lang="ts">
import { goto } from '$app/navigation';
import type { Item, Items, Project } from '../schema/app-schema';
import { searchHistoryStore } from '../stores/SearchHistoryStore.svelte';
import { onMount } from 'svelte';
import { store } from '../stores/store.svelte';

interface Props { project?: Project }
let { project }: Props = $props();

// Resolve project from multiple sources for robustness in tests
let effectiveProject: Project | null = $derived.by(() => {
    const fromProps = project ?? (store.project ?? null);
    if (fromProps) return fromProps;
    if (typeof window !== 'undefined') {
        const cur = (window as any).__CURRENT_PROJECT__ as Project | undefined;
        if (cur) return cur;
        const gs = (window as any).generalStore;
        if (gs?.project) return gs.project as Project;
        const parts = window.location.pathname.split("/").filter(Boolean);
        const projectTitle = parts[0] ? decodeURIComponent(parts[0]) : '';
        const service = (window as any).__YJS_SERVICE__;
        const yjsStoreRef = (window as any).__YJS_STORE__;
        // Do NOT auto-create a project here. In tests this can create an empty
        // project separate from the one prepared by TestHelpers, which breaks
        // SearchBox results. Wait for store.project or global state instead.
        // Keeping this block as a no-op fallback only.
    }
    return null;
});

let query = $state('');
let selected = $state(-1);
let isFocused = $state(false);
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
        const cur = (window as any).__CURRENT_PROJECT__ as Project | undefined;
        if (cur) projectToUse = cur;
    }

    // Resolve pages robustly. Prefer a non-empty generalStore.pages.current,
    // otherwise fall back to project.items. This avoids getting stuck on an
    // empty Items collection during early initialization.
    const collectPages = (): any[] => {
        try {
            if (typeof window !== 'undefined') {
                const gs = (window as any).generalStore;
                const pages = gs?.pages?.current;
                const arr: any[] = [];
                if (pages) {
                    if (typeof pages[Symbol.iterator] === 'function') {
                        for (const p of pages as any) arr.push(p);
                    } else if (typeof (pages as any).length === 'number') {
                        const len = (pages as any).length;
                        for (let i = 0; i < len; i++) {
                            const v = (pages as any).at ? (pages as any).at(i) : (pages as any)[i];
                            if (typeof v !== 'undefined') arr.push(v);
                        }
                    }
                }
                if (arr.length) return arr;
                // Fallback: if pages.current is empty, use project.items
                const projItems = gs?.project?.items as any;
                const projArr: any[] = [];
                if (projItems) {
                    if (typeof projItems[Symbol.iterator] === 'function') {
                        for (const p of projItems as any) projArr.push(p);
                    } else if (typeof (projItems as any).length === 'number') {
                        const len = (projItems as any).length;
                        for (let i = 0; i < len; i++) {
                            const v = (projItems as any).at ? (projItems as any).at(i) : (projItems as any)[i];
                            if (typeof v !== 'undefined') projArr.push(v);
                        }
                    }
                }
                if (projArr.length) return projArr;
            }
        } catch {}

        // Fallback: use project.items
        try {
            const items = projectToUse?.items as Items | undefined;
            const arr: any[] = [];
            if (items) {
                if (typeof items[Symbol.iterator] === 'function') {
                    for (const p of items as any) arr.push(p);
                } else if (typeof (items as any).length === 'number') {
                    const len = (items as any).length;
                    for (let i = 0; i < len; i++) {
                        const v = (items as any).at ? (items as any).at(i) : (items as any)[i];
                        if (typeof v !== 'undefined') arr.push(v);
                    }
                }
            }
            return arr;
        } catch { return []; }
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

// Debug mount to verify presence during E2E and schedule micro-sync ticks
onMount(() => {
    try {
        const logPrefix = "[SEA-0001][SearchBox]";
        const styles = (el: Element | null) => {
            if (!el) return null as any;
            const cs = getComputedStyle(el as Element);
            return {
                display: cs.display,
                visibility: cs.visibility,
                opacity: cs.opacity,
                transform: cs.transform,
                clipPath: (cs as any).clipPath ?? (cs as any)["clip-path"],
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
        const chain: any[] = [];
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
        role="textbox"
        aria-hidden="false"
        aria-label="Search pages"
        aria-labelledby="search-pages-label"
        placeholder="Search pages"
        data-testid="search-pages-input"
        id="search-pages-input"
        bind:this={inputEl}
        bind:value={query}
        onkeydown={handleKeydown}
        onfocus={() => { isFocused = true; shouldRefocus = true; }}
        oninput={() => { isFocused = true; shouldRefocus = true; }}
        onblur={() => (isFocused = false)}
    />
        {#if results.length && (query.length > 0)}
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

</style>
