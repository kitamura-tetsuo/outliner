<script lang="ts">
import { getLogger } from "../lib/logger";
const logger = getLogger("SearchPanel");
    import { goto } from "$app/navigation";
    import { resolvePath } from "../utils/pathUtils";
    import { onDestroy, untrack } from "svelte";
    import { page as pageStore } from "$app/stores";
    import { get } from "svelte/store";
    import { store } from "../stores/store.svelte";
    import {
        buildRegExp,
        findFirstReplaceTarget,
        replaceAll,
        replaceFirst,
        type ReplaceOptions,
        searchItems,
        type SearchOptions,
    } from "../lib/search";
    import {
        gridSearchMatches,
        clearGridSearchHighlights,
        navigateGridSearchMatch,
        replaceGridMatch,
        replaceGridMatches,
        type GridCellSearchMatch,
        type UnifiedSearchMatch,
    } from "../lib/search/unifiedSearch";
    import { iterateItems, iterateItemsDeep } from "../utils/itemTraversal";
    import { searchHighlightStore } from "../stores/searchHighlightStore.svelte";
    import type { Item, Project } from "../schema/app-schema";
    import ConfirmDialog from "./ConfirmDialog.svelte";
    import { projectPagePath } from "../lib/publicProject";

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

    let matches: UnifiedSearchMatch[] = $state([]);
    let activeMatchIndex = $state(-1);
    /** Text hits are always replaceable (modulo skipRoot); only Grid hits can be searchable-but-read-only. */
    let replaceableCount = $derived(matches.filter((m) => m.kind !== "grid-cell" || m.replaceable).length);

    let searchQuery = $state("");
    let replaceText = $state("");
    let isRegexMode = $state(false);
    let isCaseSensitive = $state(false);
    let isWholeWord = $state(false);
    let searchScope: "project" | "page" | "selection" = $state("page");

    $effect(() => {
        clearGridSearchHighlights();
        searchHighlightStore.searchQuery = isVisible ? searchQuery : "";
        searchHighlightStore.isRegexMode = isRegexMode;
        searchHighlightStore.isCaseSensitive = isCaseSensitive;
        searchHighlightStore.isWholeWord = isWholeWord;
    });
    let matchCount = $state(0);
    let inputEl: HTMLInputElement | undefined = $state();
    let showReplaceAllConfirm = $state(false);
    // Feedback for a Replace/Replace All that skipped a Grid hit: a
    // read-only/computed cell, or a substitution with no deterministic typed
    // value for that column (FTR-5194). Cleared on the next search/replace.
    let replaceStatus: string | undefined = $state();
    // Page titles are the depth-0 item of a page tree. Rewriting one renames the
    // page, changing its URL and dangling every incoming [Page Title] link, so it
    // is opt-in and always confirmed.
    let includePageTitles = $state(false);
    let showRenameConfirm = $state(false);
    let pendingRename: { pages: Item[]; run: () => void } | undefined = $state(undefined);

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
        } catch (_e) { /* ignore */ }
        // 2) Fallback to generalStore.pages.current
        try {
            const w = typeof window !== 'undefined' ? (window as Window & typeof globalThis & { generalStore?: { pages?: { current?: unknown[] } } }) : undefined;
            const gs = typeof window !== 'undefined' ? w?.generalStore : undefined;
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
        replaceStatus = undefined;
        const options: SearchOptions = {
            regex: isRegexMode,
            caseSensitive: isCaseSensitive,
            wholeWord: isWholeWord,
        };
        const pages = searchScope === "project" ? getPagesToSearch() : pageItem ? [pageItem] : [];
        try {
            logger.debug("SearchPanel.handleSearch invoked", {
                query: searchQuery,
                pagesLen: pages.length,
            });
        } catch (_e) { /* ignore */ }

        const newMatches: UnifiedSearchMatch[] = [];
        if (pages.length) {
            for (const p of pages) {
                const currentPageMatches: UnifiedSearchMatch[] = [];
                const pageMatches = searchScope === "selection" ? [] : searchItems(p, searchQuery, options);
                for (const m of pageMatches) {
                    const text = textOf(m.item);
                    for (const range of m.matches) {
                        currentPageMatches.push({
                            kind: "text-item",
                            pageId: pageIdentity(p),
                            pageTitle: textOf(p),
                            itemId: m.item.id,
                            text,
                            range,
                        });
                    }
                }
                const visualOrder: Record<string, number> = {};
                let rank = 0;
                for (const item of iterateItemsDeep([p])) {
                    visualOrder[item.id] = rank;
                    visualOrder[item.key] = rank++;
                }
                if (searchScope !== "project") {
                    currentPageMatches.push(
                        ...gridSearchMatches(pageIdentity(p), searchQuery, options, searchScope === "selection"),
                    );
                }
                currentPageMatches.sort((a, b) => {
                    const aId = a.kind === "grid-cell" ? a.placementId : a.itemId;
                    const bId = b.kind === "grid-cell" ? b.placementId : b.itemId;
                    return (visualOrder[aId] ?? Number.MAX_SAFE_INTEGER)
                        - (visualOrder[bId] ?? Number.MAX_SAFE_INTEGER);
                });
                newMatches.push(...currentPageMatches);
            }
        }

        matches = newMatches;
        matchCount = matches.length;
        activeMatchIndex = matchCount ? 0 : -1;
        try {
            if (import.meta.env.MODE === "test" || window.__E2E__) {
                window.__E2E_LAST_MATCH_COUNT__ = matchCount;
            }
            logger.debug("SearchPanel.handleSearch matches", {
                matchCount,
                items: matches.map((m) => ({ page: m.pageTitle, item: m.text })),
            });
        } catch (_e) { /* ignore */ }

    }

    function textOf(item: { text?: unknown } | null | undefined): string {
        const t = (item as { text?: { toString?: () => string } } | null | undefined)?.text;
        return t?.toString?.() ?? String(t ?? "");
    }

    function pageIdentity(item: Item): string {
        return item.id || item.key;
    }

    function replaceOptions(): ReplaceOptions {
        return {
            regex: isRegexMode,
            caseSensitive: isCaseSensitive,
            wholeWord: isWholeWord,
            skipRoot: !includePageTitles,
        };
    }

    function replacementRoots(): Item[] {
        if (searchScope === "selection") return [];
        return searchScope === "project" ? getPagesToSearch() : pageItem ? [pageItem] : [];
    }

    /** Pages whose title the pending replacement would rewrite (i.e. rename). */
    function pagesRenamedByReplaceAll(pages: Item[], options: ReplaceOptions): Item[] {
        if (!includePageTitles || !searchQuery) return [];
        const regex = buildRegExp(searchQuery, options);
        return pages.filter((p) => {
            const text = textOf(p);
            regex.lastIndex = 0;
            return text.replace(regex, replaceText) !== text;
        });
    }

    function renameMessage(pages: Item[]): string {
        const titles = pages.map((p) => `"${textOf(p)}"`).join(", ");
        const plural = pages.length === 1 ? "page" : "pages";
        return `This will rename ${pages.length} ${plural} (${titles}). `
            + `Incoming [links] to ${pages.length === 1 ? "it" : "them"} will no longer resolve, `
            + `and this action cannot be undone.`;
    }

    function confirmRename(pages: Item[], run: () => void) {
        pendingRename = { pages, run };
        showRenameConfirm = true;
    }

    /** Follow a rename of the open page instead of leaving the route 404-ing. */
    function followRenameIfNeeded(previousTitle: string | undefined) {
        if (!previousTitle || !pageItem) return;
        const newTitle = textOf(pageItem);
        if (!newTitle || newTitle === previousTitle) return;
        const currentPage = get(pageStore);
        if (currentPage.params?.page !== previousTitle) return;
        const routedProject = currentPage.params?.demoProject ?? currentPage.params?.project;
        // A rename rewrites where the open page lives; it is not a visit to a
        // different page, so it replaces the entry instead of stacking history.
        const options = { replaceState: true, keepFocus: true, noScroll: true };
        if (routedProject) goto(resolvePath(projectPagePath(routedProject, newTitle)), options);
    }

    /** The single page a Grid replace runs against; Grid participates in Page and Selection scope only, matching Find (FTR-5193). */
    function gridPageScope(): string | undefined {
        if (searchScope === "project" || !pageItem) return undefined;
        return pageIdentity(pageItem);
    }

    function summarizeGridReplaceStatus(
        outcome: { appliedCells: number; skippedReadOnly: number; skippedInvalid: number },
    ): string | undefined {
        const skipped = outcome.skippedReadOnly + outcome.skippedInvalid;
        if (skipped === 0) return undefined;
        const parts: string[] = [];
        if (outcome.skippedReadOnly) parts.push(`${outcome.skippedReadOnly} read-only`);
        if (outcome.skippedInvalid) parts.push(`${outcome.skippedInvalid} not convertible for their column`);
        return `${outcome.appliedCells} Grid cell${outcome.appliedCells === 1 ? "" : "s"} replaced; `
            + `${skipped} left unchanged (${parts.join(", ")}).`;
    }

    /** Replaces one located Grid hit, then lands on whatever now occupies its slot in the refreshed unified session -- the next valid match, since the replaced hit is gone (FTR-5194). */
    function replaceCurrentGridMatch(match: GridCellSearchMatch, index: number) {
        const outcome = replaceGridMatch(match, searchQuery, replaceText, replaceOptions());
        if (!outcome) return;
        if (!outcome.applied) {
            replaceStatus = outcome.reason === "invalid-value"
                ? "That result isn't a valid value for this column, so the cell was left unchanged."
                : "That cell is read-only and can't be replaced.";
            return;
        }
        handleSearch();
        activeMatchIndex = matches.length ? Math.min(index, matches.length - 1) : -1;
        if (activeMatchIndex >= 0) jumpTo(matches[activeMatchIndex]);
    }

    function handleReplace() {
        if (!searchQuery) return;

        const current = activeMatchIndex >= 0 ? matches[activeMatchIndex] : undefined;
        if (current?.kind === "grid-cell") {
            replaceCurrentGridMatch(current, activeMatchIndex);
            return;
        }

        const options = replaceOptions();
        const roots = replacementRoots();

        // Find the item the replacement would hit first, so a page rename can be
        // confirmed before anything is modified.
        for (const p of roots) {
            const target = findFirstReplaceTarget(p, searchQuery, replaceText, options);
            if (!target) continue;
            const run = () => {
                const previousTitle = textOf(pageItem);
                replaceFirst(p, searchQuery, replaceText, options);
                handleSearch();
                followRenameIfNeeded(previousTitle);
            };
            if (target.isRoot) {
                confirmRename([p], run);
            } else {
                run();
            }
            return;
        }

        // No text target (or Selection scope, which has none): fall back to the
        // earliest replaceable Grid hit in the unified session.
        const gridMatch = matches.find((m): m is GridCellSearchMatch => m.kind === "grid-cell" && m.replaceable);
        if (gridMatch) replaceCurrentGridMatch(gridMatch, matches.indexOf(gridMatch));
    }

    function handleReplaceAll() {
        if (!searchQuery) return;
        showReplaceAllConfirm = true;
    }

    function confirmReplaceAll() {
        showReplaceAllConfirm = false;
        const options = replaceOptions();
        const roots = replacementRoots();
        const gridPageId = gridPageScope();

        const run = () => {
            const previousTitle = textOf(pageItem);
            for (const p of roots) {
                replaceAll(p, searchQuery, replaceText, options);
            }
            const gridOutcome = gridPageId
                ? replaceGridMatches(gridPageId, searchQuery, replaceText, options, searchScope === "selection")
                : undefined;
            handleSearch();
            followRenameIfNeeded(previousTitle);
            if (gridOutcome) replaceStatus = summarizeGridReplaceStatus(gridOutcome);
        };

        const renamed = pagesRenamedByReplaceAll(roots, options);
        if (renamed.length) {
            confirmRename(renamed, run);
        } else {
            run();
        }
    }

    function jumpTo(match: UnifiedSearchMatch) {
        if (match.kind === "grid-cell") {
            navigateGridSearchMatch(match);
            return;
        }
        if (!project) return;
        const pageName = match.pageTitle;
        const currentPage = get(pageStore);
        const routedProject = currentPage.params?.demoProject ?? currentPage.params?.project ?? project.title;
        if (pageItem?.id === match.pageId) {
            document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(match.itemId)}"]`)
                ?.scrollIntoView({ block: "center" });
        } else {
            goto(resolvePath(projectPagePath(routedProject, pageName)));
        }
    }

    function moveMatch(delta: number) {
        if (!matches.length) return;
        activeMatchIndex = (activeMatchIndex + delta + matches.length) % matches.length;
        jumpTo(matches[activeMatchIndex]);
    }

    onDestroy(() => {
        clearGridSearchHighlights();
        searchHighlightStore.searchQuery = "";
    });

    $effect(() => {
        // React to page changes
        void store.pagesVersion;
        if (searchQuery) {
            untrack(() => handleSearch());
        }
    });
</script>

<svelte:window onkeydown={(e) => { if (isVisible && e.key === 'Escape') onclose?.(); }} />

{#if isVisible}
    <div
        class="search-panel"
        data-testid="search-panel"
        role="search"
        aria-label="Search and Replace"
    >
        <div class="search-panel-header">
            <h3>Search and Replace</h3>
            <button
                type="button"
                class="close-btn"
                aria-label="Close Search Panel"
                onclick={() => onclose?.()}
            >×</button>
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
            {#if replaceStatus}
                <p class="replace-status" data-testid="replace-status" role="status">{replaceStatus}</p>
            {/if}

            <div class="search-options">
                <label class="option-checkbox" for="regex-checkbox">
                    <input id="regex-checkbox" type="checkbox" bind:checked={isRegexMode} />
                    Regex
                </label>
                <label class="option-checkbox" for="case-sensitive-checkbox">
                    <input id="case-sensitive-checkbox" type="checkbox" bind:checked={isCaseSensitive} />
                    Case Sensitive
                </label>
                <label class="option-checkbox" for="whole-word-checkbox">
                    <input id="whole-word-checkbox" type="checkbox" bind:checked={isWholeWord} />
                    Whole Word
                </label>
                <label for="search-scope">Scope:</label>
                <select id="search-scope" bind:value={searchScope}>
                    <option value="project">Project text</option>
                    <option value="page">Page</option>
                    <option value="selection">Selection</option>
                </select>
                {#if searchScope === "project"}
                    <span class="scope-hint">Grid cells are available in Page or Selection scope.</span>
                {/if}
                <label class="option-checkbox" for="include-page-titles-checkbox">
                    <input
                        id="include-page-titles-checkbox"
                        type="checkbox"
                        data-testid="include-page-titles-checkbox"
                        bind:checked={includePageTitles}
                    />
                    Include page titles
                </label>
            </div>

            <div class="search-results" data-testid="search-results">
                <p data-testid="search-results-hits" aria-live="polite">Hits: {matchCount}</p>
                {#if replaceableCount < matchCount}
                    <p class="search-replaceable-hint" data-testid="search-replaceable-hint" aria-live="polite">
                        {replaceableCount} replaceable
                    </p>
                {/if}
                {#if activeMatchIndex >= 0}
                    <p class="search-match-position" aria-live="polite">
                        Match {activeMatchIndex + 1} of {matchCount}
                    </p>
                {/if}
                <div class="search-navigation">
                    <button type="button" onclick={() => moveMatch(-1)} disabled={!matchCount}>Previous</button>
                    <button type="button" onclick={() => moveMatch(1)} disabled={!matchCount}>Next</button>
                </div>
                <ul data-testid="search-results-list">
                    {#each matches as m, index (`${m.kind}-${m.pageId}-${m.kind === "grid-cell" ? `${m.placementId}-${m.rowId}-${m.columnId}` : m.itemId}-${m.range.index}`)}
                        <li
                            class="result-item"
                            data-testid="search-result-item"
                        >
                            <button type="button"
                                class="result-button"
                                data-testid="search-result-button"
                                onclick={() => { activeMatchIndex = index; jumpTo(m); }}
                            >
                                <span
                                    class="result-page"
                                    data-testid="search-result-page"
                                    >{m.pageTitle}</span
                                >
                                -
                                <span
                                    class="result-snippet"
                                    data-testid="search-result-snippet"
                                    >{m.kind === "grid-cell" ? `${m.columnId}: ${m.text}` : m.text}</span
                                >
                                {#if m.kind === "grid-cell" && !m.replaceable}
                                    <span class="result-readonly" data-testid="search-result-readonly">read-only</span>
                                {/if}
                            </button>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>
    </div>
{/if}

<ConfirmDialog
        bind:isOpen={showRenameConfirm}
        title="Rename pages?"
        message={renameMessage(pendingRename?.pages || [])}
        confirmText="Rename and Replace"
        isDestructive={true}
        onConfirm={() => {
            const pending = pendingRename;
            showRenameConfirm = false;
            pendingRename = undefined;
            pending?.run();
        }}
        onCancel={() => {
            showRenameConfirm = false;
            pendingRename = undefined;
        }}
    />

<ConfirmDialog
        bind:isOpen={showReplaceAllConfirm}
        title="Replace All"
        message="Are you sure you want to replace all occurrences? This action cannot be undone."
        confirmText="Replace All"
        isDestructive={true}
        onConfirm={confirmReplaceAll}    onCancel={() => showReplaceAllConfirm = false}
    />

<style>
    .search-panel {
        position: fixed;
        top: 60px;
        right: 20px;
        width: 500px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
    }

    .search-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #eee;
        background: #f8f9fa;
        border-radius: 8px 8px 0 0;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        line-height: 1;
        padding: 0;
    }

    .close-btn:hover {
        color: #333;
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

    .replace-status {
        margin: 4px 0 0;
        font-size: 13px;
        color: #6b7280;
    }

    .search-replaceable-hint {
        margin: 2px 0 0;
        font-size: 12px;
        color: #6b7280;
    }

    .result-readonly {
        margin-left: 6px;
        font-size: 11px;
        color: #92400e;
        background: #fef3c7;
        border-radius: 3px;
        padding: 0 4px;
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
