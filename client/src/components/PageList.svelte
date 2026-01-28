<script lang="ts">
import { createEventDispatcher, onMount } from "svelte";
import {
    Item,
    Items,
    Project,
} from "../schema/app-schema";


interface Props {
    project: Project;
    rootItems: Items; // 最上位のアイテムリスト（ページリスト）
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

// 開発環境ではデフォルトのタイトルを提案
const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
let pageTitle = $state(isDev ? `New Page ${new Date().toLocaleTimeString()}` : "");

function handleCreatePage() {
    if (!pageTitle.trim() && !isDev) {
        pageTitle = "New Page " + new Date().toLocaleString();
    }

    // プロジェクトに直接ページを追加
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
    // イベントを発火
    if (onPageSelected) {
        const event = new CustomEvent("pageSelected", {
            detail: {
                pageId: page.id,
                pageName: page.text,
            },
        });
        onPageSelected(event);
    }

    // カスタムイベントをディスパッチ
    dispatch("pageSelected", {
        pageId: page.id,
        pageName: page.text,
    });
}

onMount(() => {
    // rootItemsが存在する場合、変更を監視
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

    <ul class="m-0 list-none overflow-hidden rounded-md border border-gray-200 p-0">
        {#each rootItems as page (page.id)}
            <li class="border-b border-gray-200 last:border-b-0">
                <button
                    type="button"
                    class="flex w-full cursor-pointer items-center justify-between bg-white px-3 py-2.5 text-left text-inherit text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500"
                    onclick={() => selectPage(page)}
                >
                    <span class="font-medium text-gray-900">{page.text || "Untitled Page"}</span>
                    <span class="text-xs text-gray-400">{new Date(page.lastChanged).toLocaleDateString()}</span>
                </button>
            </li>
        {/each}

        {#if rootItems.length === 0}
            <li class="flex flex-col items-center gap-3 bg-gray-50 px-4 py-8 text-center text-gray-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <p class="m-0 text-sm">No pages found. Create a new page to get started.</p>
            </li>
        {/if}
    </ul>
</div>
