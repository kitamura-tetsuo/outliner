<script lang="ts">
	import OutlinerItem from './OutlinerItem.svelte';
	import { createEventDispatcher } from 'svelte';
	import { Item } from '../schema/app-schema';
	import { getLogger } from '../lib/logger';
	const logger = getLogger();

	
	interface Props {
		// Props
		item: Item;
		level?: number;
		currentUser?: string;
		isReadOnly?: boolean;
	}

	let {
		item,
		level = 0,
		currentUser = 'anonymous',
		isReadOnly = false
	}: Props = $props();

	const dispatch = createEventDispatcher();

	// Stateの管理
	let isEditing = $state(false);
	let isCollapsed = $state(false);
	let editText = $state('');

	// 子アイテムを持っているかどうか判定
	let hasChildren = $derived(item.items && item.items.length > 0);

	// テキストエリアのref
	let textareaRef: HTMLTextAreaElement;

	function getClickPosition(event: MouseEvent, text: string): number {
		const element = event.currentTarget as HTMLElement;
		const rect = element.getBoundingClientRect();
		const x = event.clientX - rect.left;
		
		// クリック位置に最も近い文字位置を見つける
		const span = document.createElement('span');
		span.style.font = window.getComputedStyle(element).font;
		document.body.appendChild(span);
		
		let bestPosition = 0;
		let minDistance = Infinity;
		
		for (let i = 0; i <= text.length; i++) {
			span.textContent = text.slice(0, i);
			const width = span.getBoundingClientRect().width;
			const distance = Math.abs(width - x);
			
			if (distance < minDistance) {
				minDistance = distance;
				bestPosition = i;
			}
		}
		
		document.body.removeChild(span);
		return bestPosition;
	}

	function toggleCollapse() {
		isCollapsed = !isCollapsed;
	}

	function startEditing(event?: MouseEvent) {
		if (isReadOnly) return;
		editText = item.text;
		isEditing = true;
		
		// 非同期で要素が更新された後にフォーカスとキャレット位置を設定
		setTimeout(() => {
			if (textareaRef) {
				textareaRef.focus();
				if (event) {
					const position = getClickPosition(event, item.text);
					textareaRef.setSelectionRange(position, position);
				}
			}
		}, 0);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			saveEdit();
		} else if (event.key === 'Escape') {
			isEditing = false;
		} else if (event.key === 'Tab') {
			// タブキーイベントはバブリングを止める
			event.preventDefault();
			event.stopPropagation();

			if (event.shiftKey) {
				// Unindent (Move up a level)
				dispatch('unindent', { item });
			} else {
				// Indent (Move down a level)
				dispatch('indent', { item });
			}

			logger.info('Tab key processed in textarea');
		}
	}

	// アイテム全体のキーダウンイベントハンドラ
	function handleItemKeyDown(event: KeyboardEvent) {
		// 編集中は処理しない
		if (isEditing) return;

		// Tabキーが押された場合
		if (event.key === 'Tab') {
			// タブキーイベントはバブリングを止める
			event.preventDefault();
			event.stopPropagation();

			if (event.shiftKey) {
				dispatch('unindent', { item });
				logger.info(`Unindent dispatched`);
			} else {
				dispatch('indent', { item });
				logger.info(`Indent dispatched`);
			}
		}
	}

	function saveEdit() {
		if (!isReadOnly && editText !== item.text) {
			item.updateText(editText);
		}
		isEditing = false;
	}

	function addNewItem() {
		if (!isReadOnly) {
			item.items.addNode(currentUser);
		}
	}

	function handleDelete() {
		if (isReadOnly) return;
		if (confirm('このアイテムを削除しますか？')) {
			item.delete();
		}
	}

	function toggleVote() {
		if (!isReadOnly) {
			item.toggleVote(currentUser);
		}
	}
</script>

<!-- tabindex属性を追加してキーボードフォーカスを受け付けるようにする -->
<div
	class="outliner-item"
	style="padding-left: {level * 20}px"
	tabindex="0"
	onkeydown={handleItemKeyDown}
>
	<div class="item-header">
		{#if hasChildren}
			<button class="collapse-btn" onclick={toggleCollapse}>
				{isCollapsed ? '▶' : '▼'}
			</button>
		{:else}
			<span class="bullet">•</span>
		{/if}

		{#if isEditing}
			<textarea
				bind:this={textareaRef}
				bind:value={editText}
				onkeydown={handleKeyDown}
				onblur={saveEdit}
				rows={Math.max(1, editText.split('\n').length)}
				autofocus
			></textarea>
		{:else}
			<div class="item-content" onclick={startEditing}>
				<!-- 空白のノートではなく、常に.item-textクラスを適用 -->
				<span class="item-text">{item.text || '空白のノート'}</span>

				{#if item.votes.length > 0}
					<span class="vote-count">{item.votes.length}</span>
				{/if}
			</div>
		{/if}

		<div class="item-actions">
			<button onclick={addNewItem} title="新しいアイテムを追加">+</button>
			<button onclick={handleDelete} title="削除">×</button>
			<button
				onclick={toggleVote}
				class="vote-btn"
				class:voted={item.votes.includes(currentUser)}
				title="投票"
			>
				⭐
			</button>
		</div>
	</div>

	{#if hasChildren && !isCollapsed}
		<div class="item-children">
			{#each [...item.items] as child, i}
				<OutlinerItem
					item={child}
					level={level + 1}
					{currentUser}
					{isReadOnly}
					on:indent
					on:unindent
					on:add
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.outliner-item {
		position: relative;
		margin: 0;
		padding-top: 4px;
		padding-bottom: 4px;
	}

	.item-header {
		display: flex;
		align-items: center;
		min-height: 24px;
	}

	.collapse-btn,
	.bullet {
		width: 18px;
		display: flex;
		justify-content: center;
		align-items: center;
		margin-right: 4px;
	}

	.collapse-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-size: 10px;
		color: #555;
	}

	.bullet {
		font-size: 18px;
		color: #999;
	}

	.item-content {
		flex-grow: 1;
		padding: 2px 4px;
		margin-right: 8px;
		border-radius: 2px;
		min-height: 18px;
	}

	.item-content:hover {
		background: #f5f5f5;
	}

	textarea {
		width: 100%;
		border: 1px solid #ddd;
		border-radius: 3px;
		padding: 4px;
		font-family: inherit;
		font-size: inherit;
		resize: vertical;
		background: #fff;
	}

	.group-name {
		font-weight: 500;
		color: #333;
	}

	.item-actions {
		display: flex;
		gap: 4px;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.outliner-item:hover > .item-header .item-actions {
		opacity: 1;
	}

	.item-actions button {
		background: none;
		border: none;
		cursor: pointer;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		border-radius: 3px;
	}

	.item-actions button:hover {
		background: #eee;
	}

	.vote-count {
		background: #eef;
		padding: 0 4px;
		border-radius: 10px;
		font-size: 12px;
		margin-left: 6px;
	}

	.vote-btn {
		color: #ccc;
	}

	.vote-btn.voted {
		color: gold;
	}

	.item-children {
		margin-left: 2px;
	}

	/* フォーカス時のスタイルを追加 */
	.outliner-item:focus {
		outline: 1px dashed #aaa;
		background-color: rgba(0, 0, 0, 0.02);
	}
</style>
