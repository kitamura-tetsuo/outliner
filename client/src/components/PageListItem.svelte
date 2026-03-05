<script lang="ts">
import { onMount } from "svelte";
import type { Item } from "../schema/app-schema";

interface Props {
    page: Item;
    isGridView: boolean;
    onSelect: (page: Item) => void;
}

let { page, isGridView, onSelect }: Props = $props();

let preview = $state<{ lines: string[]; image: string | null }>({ lines: [], image: null });
let pageTitle = $state(page.text || "Untitled Page");
let lastChanged = $state(page.lastChanged);

function extractPagePreview(pageItem: Item, maxLines: number = 3, maxDepth: number = 3) {
    const lines: string[] = [];
    let image: string | null = null;
    let nodeCount = 0;
    const maxNodes = 50;

    function traverse(item: Item, currentDepth: number) {
        if (nodeCount >= maxNodes) return;
        nodeCount++;

        if (!image && item.attachments) {
            try {
                const arr = item.attachments.toArray();
                if (arr && arr.length > 0) {
                    const val = arr[0];
                    if (typeof val === "string") {
                        image = val;
                    } else if (val && typeof val === "object") {
                        if ("url" in val) {
                            image = (val as any).url;
                        } else if (Array.isArray(val) && val.length > 0) {
                            image = val[0];
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to extract attachment", e);
            }
        }

        let text = "";
        try {
            text = item.text ? item.text.trim() : "";
        } catch (e) {
             console.warn("Failed to extract text", e);
        }

        if (text && lines.length < maxLines && item !== pageItem) {
            lines.push(text);
        }

        if (currentDepth >= maxDepth) return;

        try {
            if (item.items) {
                let i = 0;
                const children = Array.from(item.items);
                for (const child of children) {
                    if (i++ > 10) break;
                    traverse(child, currentDepth + 1);
                    if (lines.length >= maxLines && image) return;
                    if (nodeCount >= maxNodes) return;
                }
            }
        } catch (e) {
            console.warn("Failed to iterate children", e);
        }
    }

    try {
        if (pageItem.items) {
            let i = 0;
            const rootChildren = Array.from(pageItem.items);
            for (const child of rootChildren) {
                if (i++ > 20) break;
                traverse(child, 1);
                if (lines.length >= maxLines && image) break;
            }
        }
    } catch (e) {
        console.warn("Failed to iterate root children", e);
    }

    return { lines, image };
}

function updatePreview() {
    preview = extractPagePreview(page);
    pageTitle = page.text || "Untitled Page";
    lastChanged = page.lastChanged;
}

onMount(() => {
    updatePreview();

    // Listen for Yjs updates to reactively update the preview
    if (page.ydoc) {
        page.ydoc.on("update", updatePreview);
        return () => {
            page.ydoc.off("update", updatePreview);
        };
    }
});
</script>

{#if isGridView}
    <li class="flex flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md h-full">
        <button
            type="button"
            class="flex h-full w-full cursor-pointer flex-col text-left text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            onclick={() => onSelect(page)}
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
                    <p class="m-0 text-gray-400 italic">No content</p>
                {/if}
            </div>

            <div class="p-3 pt-0 mt-auto text-xs text-gray-400 text-right">
                {lastChanged ? new Date(lastChanged).toLocaleDateString() : ""}
            </div>
        </button>
    </li>
{:else}
    <li class="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3 shadow-sm transition-colors hover:bg-gray-50">
        <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onclick={() => onSelect(page)}
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
                            <span class="italic">No text content</span>
                        {/if}
                    </span>
                </div>
            </div>
            <div class="ml-4 shrink-0 text-xs text-gray-400">
                {lastChanged ? new Date(lastChanged).toLocaleDateString() : ""}
            </div>
        </button>
    </li>
{/if}
