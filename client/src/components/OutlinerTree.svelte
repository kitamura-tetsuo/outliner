<script lang="ts">
	import { Tree } from 'fluid-framework';
	import { onMount } from 'svelte';
	import { Item, Items } from '../schema/app-schema';
	import { fluidClient } from '../stores/fluidStore';
	import OutlinerItem from './OutlinerItem.svelte';

	export let rootItems: Items;

	let currentUser = 'anonymous';
	let items = [];

	onMount(() => {
		if ($fluidClient?.currentUser) {
			currentUser = $fluidClient.currentUser.id;
		}

		// 初期アイテムのロード
		updateItems();

		// アイテムの変更を監視 - イベント名を修正
		const unsubscribe = Tree.on(rootItems, 'treeChanged', updateItems);

		return () => {
			unsubscribe();
		};
	});

	function updateItems() {
		// rootItemsの変更を反映
		items = [...rootItems];
		console.log('Items updated:', items);

		// 強制的に更新をトリガー
		items = items;
	}

	function handleAddItem() {
		rootItems.addNode(currentUser);
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

		console.log('Indent event received for item:', item);

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
			const itemIndex = parent.indexOf(item);
			parent.moveRangeToEnd(itemIndex, itemIndex + 1, previousItem.items);
			console.log(`Indented item under previous item`);
		} catch (error) {
			console.error('Failed to indent item:', error);
		}
	}

	function handleUnindent(event) {
		// インデントを減らす処理
		const { item } = event.detail;

		console.log('Unindent event received for item:', item);

		// 1. アイテムの親を取得
		const parent = Tree.parent(item);
		if (!Tree.is(parent, Items)) return;

		// 2. 親の親を取得（親グループを取得）
		const grandParent = Tree.parent(parent);
		if (!grandParent || !Tree.is(grandParent, Items)) return; // ルートアイテムの直下は既に最上位

		try {
			// 3. 親アイテムのindex取得
			const parentItem = Tree.parent(parent) as Item;
			const parentIndex = grandParent.indexOf(parentItem);

			// 4. 親の親の、親の次の位置にアイテムを移動
			const itemIndex = parent.indexOf(item);
			grandParent.moveRangeToIndex(itemIndex, itemIndex + 1, parentIndex + 1, parent);
			console.log('Unindented item to parent level');
		} catch (error) {
			console.error('Failed to unindent item:', error);
		}
	}
</script>

<div class="outliner">
	<div class="toolbar">
		<h2>アウトライン</h2>
		<div class="actions">
			<button on:click={handleAddItem}>アイテム追加</button>
		</div>
	</div>

	<div class="tree-container">
		{#each items as item}
			<OutlinerItem
				{item}
				{currentUser}
				on:add={handleAddAfter}
				on:indent={handleIndent}
				on:unindent={handleUnindent}
			/>
		{/each}

		{#if items.length === 0}
			<div class="empty-state">
				<p>アイテムがありません。「アイテム追加」ボタンを押して始めましょう。</p>
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

	.toolbar h2 {
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
