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

// Propose default title in development environment
const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
let pageTitle = $state(isDev ? `New Page ${new Date().toLocaleTimeString()}` : "");

function handleCreatePage() {
    if (!pageTitle.trim() && !isDev) {
        pageTitle = "New Page " + new Date().toLocaleString();
    }

    // Add page directly to project
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

// // Page list update processing
// function updatePageList() {
// 	if (rootItems) {
// 		displayItems = [...rootItems];
// 		logger.info('PageList updated:', displayItems.length);
// 	}
// }

onMount(() => {
    // Monitor changes if rootItems exists
    if (rootItems) {
        // 	const unsubscribe = Tree.on(rootItems, 'treeChanged', updatePageList);
        // 	return () => {
        // 		if (unsubscribe) unsubscribe();
        // 	};
    }
});

// Update list on initial display
// run is no longer needed in Svelte 5
</script>

<div class="page-list">
    <h2>Page List</h2>

    <div class="page-create">
        <input
            type="text"
            bind:value={pageTitle}
            placeholder="New page name"
            aria-label="New page name"
            onkeydown={handleKeyDown}
        />
        <button type="button" onclick={handleCreatePage}>Create</button>
    </div>

    <ul>
        {#each rootItems as page (page.id)}
            <li>
                <button type="button" class="page-item-button" onclick={() => selectPage(page)}>
                    <span class="page-title">{page.text || "Untitled Page"}</span>
                    <span class="page-date">{new Date(page.lastChanged).toLocaleDateString()}</span>
                </button>
            </li>
        {/each}

        {#if rootItems.length === 0}
            <li class="empty">No pages found. Please create a new page.</li>
        {/if}
    </ul>
</div>

<style>
.page-list {
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 15px;
    margin-bottom: 20px;
}

h2 {
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 18px;
}

.page-create {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}

input {
    flex: 1;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.page-create button {
    background: #4285f4;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0 15px;
    cursor: pointer;
}

ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

li {
    border-bottom: 1px solid #eee;
}

.page-item-button {
    width: 100%;
    padding: 8px 10px;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    text-align: left;
    font: inherit;
    color: inherit;
}

.page-item-button:hover {
    background: #f5f5f5;
}

.page-title {
    font-weight: 500;
}

.page-date {
    color: #777;
    font-size: 12px;
}

.empty {
    padding: 8px 10px;
    color: #888;
    text-align: center;
    cursor: default;
}
</style>
