<script lang="ts">
import { createEventDispatcher } from "svelte";
import {
    Item,
    Items,
    Project,
} from "../schema/app-schema";
import PageListItem from "./PageListItem.svelte";

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
let isGridView = $state(true); // Default to grid view

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
</script>

<div class="mb-5 rounded-md border border-gray-200 bg-white p-4">
    <div class="mb-4 flex items-center justify-between">
        <h2 class="m-0 text-lg font-medium text-gray-800">Pages</h2>

        <div class="flex items-center gap-1 rounded-md bg-gray-100 p-1">
            <button
                type="button"
                onclick={() => (isGridView = false)}
                class="rounded px-2 py-1 text-sm font-medium transition-colors {isGridView ? 'text-gray-500 hover:text-gray-700' : 'bg-white text-blue-600 shadow-sm'}"
                aria-label="List view"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            </button>
            <button
                type="button"
                onclick={() => (isGridView = true)}
                class="rounded px-2 py-1 text-sm font-medium transition-colors {isGridView ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
                aria-label="Grid view"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            </button>
        </div>
    </div>

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

    <ul class="m-0 list-none gap-4 p-0 {isGridView ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'flex flex-col'}">
        {#each rootItems as page (page.id)}
            <PageListItem {page} {isGridView} onSelect={selectPage} />
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
