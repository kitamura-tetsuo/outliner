<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { Tree } from 'fluid-framework';
	import { TreeViewManager } from '../fluid/TreeViewManager';
	import { Item, Items, Project } from '../schema/app-schema';
	import { fluidClient } from '../stores/fluidStore';
	import { getLogger } from '../lib/logger';
	const logger = getLogger();

	export let project: Project;
	export let rootItems: Items; // 最上位のアイテムリスト（ページリスト）
	export let currentPageId: string = '';
	export let currentPage: Item | null = null; // 直接ページオブジェクトを受け取るように追加
	export let currentUser: string = 'anonymous';

	const dispatch = createEventDispatcher();

	// 開発環境ではデフォルトのタイトルを提案
	const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
	let pageTitle = isDev ? `新しいページ ${new Date().toLocaleTimeString()}` : '';

	// ページリストの表示用配列
	let displayItems = [...rootItems];

	function handleCreatePage() {
		if (!pageTitle.trim() && !isDev) {
			pageTitle = '新しいページ ' + new Date().toLocaleString();
		}

		// TreeViewManagerを使用して、正しくページを追加
		const newPage = TreeViewManager.addPage(project, pageTitle, currentUser);
		pageTitle = isDev ? `新しいページ ${new Date().toLocaleTimeString()}` : '';

		// 新しいページを選択（オブジェクト直接渡し）
		dispatch('select', {
			page: newPage,
			pageId: newPage.id
		});
	}

	function selectPage(page: Item) {
		dispatch('select', {
			page: page,
			pageId: page.id
		});
	}

	// ページリストの更新処理
	function updatePageList() {
		if (rootItems) {
			displayItems = [...rootItems];
			logger.info('PageList updated:', displayItems.length);
		}
	}

	onMount(() => {
		// rootItemsが存在する場合、変更を監視
		if (rootItems) {
			const unsubscribe = Tree.on(rootItems, 'treeChanged', updatePageList);

			return () => {
				if (unsubscribe) unsubscribe();
			};
		}
	});

	// 初期表示時にリストを更新
	$: if (rootItems) {
		displayItems = [...rootItems];
	}
</script>

<div class="page-list">
	<h2>ページ一覧</h2>

	<div class="page-create">
		<input type="text" bind:value={pageTitle} placeholder="新しいページ名" />
		<button on:click={handleCreatePage}>作成</button>
	</div>

	<ul>
		{#each displayItems as page}
			<li class:active={page.id === currentPageId} on:click={() => selectPage(page)}>
				<span class="page-title">{page.text || '無題のページ'}</span>
				<span class="page-date">{new Date(page.lastChanged).toLocaleDateString()}</span>
			</li>
		{/each}

		{#if displayItems.length === 0}
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

	li.active {
		background: #e3f2fd;
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
