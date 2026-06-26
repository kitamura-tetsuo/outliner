<script lang="ts">
import { getLogger } from "../lib/logger";
const logger = getLogger("PageListItem");
import type { Item } from "../schema/app-schema";
import { extractPagePreview } from "../lib/pagePreview";

interface Props {
    href?: string;
    page: Item;
    isGridView: boolean;
    onPageClick?: () => void;
}

let { page, isGridView, href, onPageClick }: Props = $props();

function handleClick(_e: MouseEvent) {
    if (onPageClick) {
        // Let SvelteKit's standard router handle the navigation.
        // We just notify the parent component that a page was clicked.
        onPageClick();
    }
}

let preview = $state<{ lines: string[]; image: string | null }>({ lines: [], image: null });
let pageTitle = $state("");
let lastChanged = $state<number | undefined>();

function updatePreview() {
    preview = page.preview || extractPagePreview(page);
    try {
        pageTitle = page.text || "Untitled Page";
    } catch (e) {
        logger.warn({ err: e }, "[PageListItem] updatePreview text extraction error");
        pageTitle = "Untitled Page";
    }
    lastChanged = page.lastChanged;
}

$effect(() => {
    // Initial update
    updatePreview();

    // Listen for Yjs updates to reactively update the preview
    // This effect will re-run and clean up the old listener if 'page' or 'page.ydoc' changes
    const currentDoc = page.ydoc;
    if (currentDoc) {
        currentDoc.on("update", updatePreview);
        return () => {
            currentDoc.off("update", updatePreview);
        };
    }
});

    function formatDate(ts: number | undefined): string {
        if (!ts) return "";
        const date = new Date(ts);
        if (isNaN(date.getTime())) return "";
        return date.toLocaleDateString();
    }

</script>

{#if isGridView}
    <li class="flex flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md h-full">
        <a
            href={href}
            class="flex h-full w-full cursor-pointer flex-col text-left text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            onclick={handleClick}
        >
            <div class="p-3 pb-2 w-full font-medium text-gray-900 border-b border-gray-100 bg-gray-50/50 truncate">
                {pageTitle}
            </div>

            {#if preview.image}
                <img src={preview.image} alt="" class="h-32 w-full object-cover border-b border-gray-100" />
            {/if}

            <div class="p-3 text-sm text-gray-600 flex-grow">
                {#each preview.lines as line, i (i)}
                    <p class="m-0 mb-1 line-clamp-1">{line}</p>
                {/each}
                {#if preview.lines.length === 0 && !preview.image}
                    <div class="flex items-center justify-center h-full min-h-[3rem] rounded border border-dashed border-gray-200 bg-gray-50/50">
                        <span class="text-xs text-gray-400 font-medium">Empty page - Click to start writing</span>
                    </div>
                {/if}
            </div>

            <div class="p-3 pt-0 mt-auto text-xs text-gray-400 text-right">
                {formatDate(lastChanged)}
            </div>
        </a>
    </li>
{:else}
    <li class="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3 shadow-sm transition-colors hover:bg-gray-50">
        <a
            href={href}
            class="flex w-full cursor-pointer items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onclick={handleClick}
        >
            <div class="flex items-center gap-3 overflow-hidden">
                {#if preview.image}
                    <div class="h-10 w-10 shrink-0 overflow-hidden rounded bg-gray-100">
                        <img src={preview.image} alt="" class="h-full w-full object-cover" />
                    </div>
                {:else}
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-400">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    </div>
                {/if}
                <div class="flex flex-col overflow-hidden">
                    <span class="truncate font-medium text-gray-900">{pageTitle}</span>
                    <span class="truncate text-xs text-gray-500">
                        {#if preview.lines.length > 0}
                            {preview.lines[0]}
                        {:else}
                            <span class="italic text-gray-400">Empty page - Click to start writing</span>
                        {/if}
                    </span>
                </div>
            </div>
            <div class="ml-4 shrink-0 text-xs text-gray-400">
                {formatDate(lastChanged)}
            </div>
        </a>
    </li>
{/if}
