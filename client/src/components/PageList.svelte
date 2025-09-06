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
    currentPage?: Item | null; // 直接ページオブジェクトを受け取るように追加
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
        <input type="text" bind:value={pageTitle} placeholder="新しいページ名" />
        <button onclick={handleCreatePage}>作成</button>
    </div>

    <ul>
        {#each rootItems as page}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <li onclick={() => selectPage(page)}>
                <span class="page-title">{page.text || "無題のページ"}</span>
                <span class="page-date">{new Date(page.lastChanged).toLocaleDateString()}</span>
            </li>
        {/each}

        {#if rootItems.length === 0}
            <li class="empty">ページがありません。新しいページを作成してください。</li>
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

button {
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
    padding: 8px 10px;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
}

li:hover {
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
    color: #888;
    text-align: center;
    cursor: default;
}
</style>
