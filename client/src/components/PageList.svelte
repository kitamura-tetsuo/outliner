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
let pageTitle = $state(isDev ? `新しいページ ${new Date().toLocaleTimeString()}` : "");

function handleCreatePage() {
    if (!pageTitle.trim() && !isDev) {
        pageTitle = "新しいページ " + new Date().toLocaleString();
    }

    // プロジェクトに直接ページを追加
    project.addPage(pageTitle, currentUser);
    pageTitle = isDev ? `新しいページ ${new Date().toLocaleTimeString()}` : "";


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

// // ページリストの更新処理
// function updatePageList() {
// 	if (rootItems) {
// 		displayItems = [...rootItems];
// 		logger.info('PageList updated:', displayItems.length);
// 	}
// }

onMount(() => {
    // rootItemsが存在する場合、変更を監視
    if (rootItems) {
        // 	const unsubscribe = Tree.on(rootItems, 'treeChanged', updatePageList);
        // 	return () => {
        // 		if (unsubscribe) unsubscribe();
        // 	};
    }
});

// 初期表示時にリストを更新
// Svelte 5ではrunは不要になりました
</script>

<div class="page-list">
    <h2>ページ一覧</h2>

    <div class="page-create">
        <input type="text" bind:value={pageTitle} placeholder="新しいページ名" aria-label="新しいページ名" />
        <button type="button" onclick={handleCreatePage} aria-label="新しいページを作成">
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>作成</span>
        </button>
    </div>

    <ul>
        {#each rootItems as page (page.id)}
            <li>
                <button type="button" class="page-item-button" onclick={() => selectPage(page)}>
                    <span class="page-title">{page.text || "無題のページ"}</span>
                    <span class="page-date">{new Date(page.lastChanged).toLocaleDateString()}</span>
                </button>
            </li>
        {/each}

        {#if rootItems.length === 0}
            <li class="empty">
                <div class="empty-state-content">
                    <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="empty-icon"
                        aria-hidden="true"
                    >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="12" y1="18" x2="12" y2="12"></line>
                        <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                    <p>ページがありません。</p>
                    <p class="empty-hint">新しいページを作成して始めましょう。</p>
                </div>
            </li>
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
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
    transition: background-color 0.2s;
}

.page-create button:hover {
    background: #3367d6;
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
    padding: 24px 10px;
    color: #888;
    text-align: center;
    cursor: default;
    background: #f9f9f9;
    border-radius: 4px;
    border: 1px dashed #ddd;
    border-bottom: 1px dashed #ddd; /* Override li border */
    margin-top: 10px;
}

.empty-state-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.empty-icon {
    color: #ccc;
    margin-bottom: 4px;
}

.empty p {
    margin: 0;
    font-weight: 500;
}

.empty .empty-hint {
    font-size: 13px;
    color: #999;
    font-weight: normal;
}
</style>
