<script lang="ts">
import { createEventDispatcher, onMount } from "svelte";
import {
    Item,
    Items,
    Project,
} from "../schema/app-schema";


interface Props {
    project: Project;
    rootItems: Items; // Top-level item list (page list)
    currentUser?: string;
    onPageSelected?: (event: CustomEvent<{ pageId: string; pageName: string; }>) => void;
}

let {
    project,
    rootItems,
    currentUser = "anonymous",
    onPageSelected,
}: Props = $props();

const dispatch = createEventDispatcher();

// Suggest a default title in development environment
const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
let pageTitle = $state(isDev ? `New Page ${new Date().toLocaleTimeString()}` : "");
let inputEl: HTMLInputElement | undefined = $state();

function handleCreatePage() {
    if (!pageTitle.trim() && !isDev) {
        pageTitle = "New Page " + new Date().toLocaleString();
    }

    // Add a page directly to the project
    const newPage = project.addPage(pageTitle, currentUser);
    selectPage(newPage);
    pageTitle = isDev ? `New Page ${new Date().toLocaleTimeString()}` : "";
}

function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.isComposing) {
        handleCreatePage();
    }
}

function selectPage(page: Item) {
    // Fire event
    if (onPageSelected) {
        const event = new CustomEvent("pageSelected", {
            detail: {
                pageId: page.id,
                pageName: page.text,
            },
        });
        onPageSelected(event);
    }

    // Dispatch custom event
    dispatch("pageSelected", {
        pageId: page.id,
        pageName: page.text,
    });
}


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
                    if (typeof val === 'string') {
                        image = val;
                    } else if (val && typeof val === 'object') {
                        // Assuming it might be a JSON object with url
                        if ('url' in val) {
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
                // iterateUnordered is safer if order array gets out of sync during render,
                // but we will try normal iteration with try/catch.
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

onMount(() => {
    // Monitor changes if rootItems exists
    if (rootItems) {
        // 	const unsubscribe = Tree.on(rootItems, 'treeChanged', updatePageList);
        // 	return () => {
        // 		if (unsubscribe) unsubscribe();
        // 	};
    }
});
</script>

<div class="mb-5 rounded-md border border-gray-200 bg-white p-4">
    <h2 class="mb-4 mt-0 text-lg font-medium text-gray-800">Pages</h2>

    <div class="mb-4 flex gap-2">
        <input
            type="text"
            bind:this={inputEl}
            bind:value={pageTitle}
            placeholder="New page name"
            aria-label="New page name"
            onkeydown={handleKeyDown}
            class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm transition-shadow focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
        />
        <button
            type="button"
            onclick={handleCreatePage}
            aria-label="Create new page"
            class="flex items-center gap-1.5 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Create</span>
        </button>
    </div>

    <ul class="m-0 list-none grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-0">
        {#each rootItems as page (page.id)}
            {@const preview = extractPagePreview(page)}
            <li class="flex flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                <button
                    type="button"
                    class="flex h-full w-full cursor-pointer flex-col text-left text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    onclick={() => selectPage(page)}
                >
                    <div class="p-3 pb-2 w-full font-medium text-gray-900 border-b border-gray-100 bg-gray-50/50">
                        {page.text || "Untitled Page"}
                    </div>

                    {#if preview.image}
                        <img src={preview.image} alt="" class="h-32 w-full object-cover border-b border-gray-100" />
                    {/if}

                    <div class="p-3 text-sm text-gray-600 flex-grow">
                        {#each preview.lines as line}
                            <p class="m-0 mb-1 line-clamp-1">{line}</p>
                        {/each}
                        {#if preview.lines.length === 0 && !preview.image}
                            <p class="m-0 text-gray-400 italic">No content</p>
                        {/if}
                    </div>

                    <div class="p-3 pt-0 mt-auto text-xs text-gray-400 text-right">
                        {page.lastChanged ? new Date(page.lastChanged).toLocaleDateString() : ""}
                    </div>
                </button>
            </li>
        {/each}

        {#if rootItems.length === 0}
            <li class="col-span-full flex flex-col items-center gap-3 rounded-md bg-gray-50 px-4 py-8 text-center text-gray-500 border border-gray-200">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <div class="text-center">
                    <p class="m-0 mb-2 text-sm">No pages found.</p>
                    <button
                        type="button"
                        onclick={() => inputEl?.focus()}
                        class="text-sm font-medium text-blue-600 hover:text-blue-500 hover:underline focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                        Create a new page to get started
                    </button>
                </div>
            </li>
        {/if}
    </ul>
</div>
