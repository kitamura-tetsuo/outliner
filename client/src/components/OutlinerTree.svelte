<script lang="ts">
	import { Tree } from 'fluid-framework';
	import { onDestroy, onMount } from 'svelte';
	import { Item, Items } from '../schema/app-schema';
	import { fluidClient } from '../stores/fluidStore';
	import OutlinerItem from './OutlinerItem.svelte';
	import { getLogger } from '../lib/logger';
	const logger = getLogger();

	export let pageItem: Item; // ページとして表示する Item
	export let isReadOnly = false;

	let currentUser = 'anonymous';
	let items = [];
	let title = '';

	// デバウンス用のフラグとタイマーID
	let inProgress = false;
	let operationTimer: ReturnType<typeof setTimeout> | null = null;

	$: if (pageItem) {
		title = pageItem.text;
		items = [...pageItem.items]; // ページアイテムの子アイテムを表示
	}

	onMount(() => {
		if ($fluidClient?.currentUser) {
			currentUser = $fluidClient.currentUser.id;
		}

		// アイテムの変更を監視
		const unsubscribe = pageItem ? Tree.on(pageItem, 'treeChanged', updateItems) : undefined;

		return () => {
			if (unsubscribe) unsubscribe();
		};
	});

	onDestroy(() => {
		if (operationTimer) clearTimeout(operationTimer);
	});

	function updateItems() {
		// ページコンテンツの変更を反映
		if (pageItem) {
			items = [...pageItem.items];
			logger.info('Items updated:', items);
		}
	}

	function handleUpdateTitle() {
		if (pageItem && !isReadOnly) {
			pageItem.updateText(title);
		}
	}

	function handleAddItem() {
		if (pageItem && !isReadOnly) {
			pageItem.items.addNode(currentUser);
		}
	}

	function handleAddGroup() {
		rootItems.addGroup('新しいグループ');
	}

	function handleAddAfter(event) {
		const { after } = event.detail;
		// 親アイテムを見つけて、その後ろに新しいアイテムを追加
		const parent = rootItems; // 本来はTree.parent(after)を使うべきだが、ここではrootItemsとする
		if (parent) {
			const index = parent.indexOf(after);
			if (index !== -1) {
				const newNote = rootItems.addNode(currentUser);
				// 本来はここで挿入位置を調整すべき
			}
		}
	}

	function handleIndent(event) {
		// インデントを増やす処理
		const { item } = event.detail;

		logger.info('Indent event received for item:', item);

		// 1. アイテムの親を取得
		const parent = Tree.parent(item);
		if (!Tree.is(parent, Items)) return;

		// 2. 親内でのアイテムのインデックスを取得
		const index = parent.indexOf(item);
		if (index <= 0) return; // 最初のアイテムはインデントできない

		// 3. 前のアイテムを取得
		const previousItem = parent[index - 1];

		try {
			// 4. 前のアイテムの子リストへアイテムを移動
			// itemIndexが確実に取得できるようにインデックスを再計算
			const itemIndex = parent.indexOf(item);

			// 移動操作の前にログを追加
			logger.info(
				`Moving item from parent (${parent.length} items) at index ${itemIndex} to previous item's children`
			);

			// 厳密なトランザクション処理を行う
			Tree.runTransaction(parent, () => {
				previousItem.items.moveRangeToEnd(itemIndex, itemIndex + 1, parent);
			});

			logger.info(`Indented item under previous item`);
		} catch (error) {
			console.error('Failed to indent item:', error);
		}
	}

	function handleUnindent(event) {
		// インデントを減らす処理
		const { item } = event.detail;

		logger.info('Unindent event received for item:', item);

		// 1. アイテムの親を取得
		const parentList = Tree.parent(item);
		if (!Tree.is(parentList, Items)) return;

		// 2. 親の親を取得（親グループを取得）
		const parentItem = Tree.parent(parentList);
		if (!parentItem || !Tree.is(parentItem, Item)) return; // ルートアイテムの直下は既に最上位

		const grandParentList = Tree.parent(parentItem);
		if (!grandParentList || !Tree.is(grandParentList, Items)) return; // ルートアイテムの直下は既に最上位

		try {
			// 3. 親アイテムのindex取得
			const parentIndex = grandParentList.indexOf(parentItem);

			// 4. 親の親の、親の次の位置にアイテムを移動
			const itemIndex = parentList.indexOf(item);
			grandParentList.moveRangeToIndex(parentIndex + 1, itemIndex, itemIndex + 1, parentList);
			logger.info('Unindented item to parent level');
		} catch (error) {
			console.error('Failed to unindent item:', error);
		}
	}
</script>

<div class="outliner">
	<div class="toolbar">
		<div class="title-container">
			{#if isReadOnly}
				<h2>{title || '無題のページ'}</h2>
			{:else}
				<input
					type="text"
					bind:value={title}
					placeholder="ページタイトル"
					on:blur={handleUpdateTitle}
					class="title-input"
				/>
			{/if}
		</div>

		{#if !isReadOnly}
			<div class="actions">
				<button on:click={handleAddItem}>アイテム追加</button>
			</div>
		{/if}
	</div>

	<div class="tree-container">
		{#each items as item}
			<OutlinerItem
				{item}
				{currentUser}
				{isReadOnly}
				on:add={handleAddAfter}
				on:indent={handleIndent}
				on:unindent={handleUnindent}
			/>
		{/each}

		{#if items.length === 0}
			<div class="empty-state">
				<p>
					{#if isReadOnly}
						このページにはまだ内容がありません。
					{:else}
						アイテムがありません。「アイテム追加」ボタンを押して始めましょう。
					{/if}
				</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.outliner {
		background: white;
		border: 1px solid #ddd;
		border-radius: 6px;
		overflow: hidden;
		margin-bottom: 20px;
	}

	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 16px;
		background: #f5f5f5;
		border-bottom: 1px solid #ddd;
	}

	.title-container {
		flex: 1;
	}

	.title-input {
		width: 100%;
		font-size: 18px;
		font-weight: 500;
		padding: 4px 8px;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	h2 {
		margin: 0;
		font-size: 18px;
	}

	.actions {
		display: flex;
		gap: 8px;
	}

	.actions button {
		background: #fff;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 4px 10px;
		font-size: 14px;
		cursor: pointer;
	}

	.actions button:hover {
		background: #f0f0f0;
	}

	.tree-container {
		padding: 10px;
		min-height: 200px;
	}

	.empty-state {
		color: #888;
		text-align: center;
		padding: 20px;
	}
</style>
