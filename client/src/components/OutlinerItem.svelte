<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { getLogger } from '../lib/logger';
	import { Item } from '../schema/app-schema';
	import { TreeSubscriber } from '../stores/TreeSubscriber';
	import OutlinerItem from './OutlinerItem.svelte';
	const logger = getLogger();

	interface Props {
		// Props
		item: Item;
		level?: number;
		currentUser?: string;
		isReadOnly?: boolean;
	}

	let { item, level = 0, currentUser = 'anonymous', isReadOnly = false }: Props = $props();

	// 子アイテムを監視するためのTreeSubscriberを作成
	let childrenSubscriber = $state(new TreeSubscriber(item.items, 'nodeChanged'));

	// 子アイテムの変更を監視する
	$effect(() => {
		// 親アイテムが変わったときに子アイテムの監視を更新
		childrenSubscriber = new TreeSubscriber(item.items, 'nodeChanged');
	});

	const dispatch = createEventDispatcher();

	// Stateの管理
	let isEditing = $state(false);
	let isCollapsed = $state(false);
	let editText = $state('');

	// 子アイテムを持っているかどうか判定（リアクティブに更新）
	let hasChildren = $derived(childrenSubscriber.current && childrenSubscriber.current.length > 0);

	// テキストエリアのref
	let textareaRef: HTMLTextAreaElement;
	// アイテム全体のDOMエレメントのref
	let itemRef: HTMLDivElement;

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
				dispatch('unindent', { item, focusAfter: () => itemRef.focus() });
				logger.info(`Unindent dispatched`);
			} else {
				dispatch('indent', { item, focusAfter: () => itemRef.focus() });
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
	bind:this={itemRef}
	data-item-id={item.id}
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
			{#each [...childrenSubscriber.current] as child, i}
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
		font-size: 0.7rem;
		color: #666;
	}

	.item-content {
		flex-grow: 1;
		padding: 4px 8px;
		border-radius: 4px;
		cursor: text;
		min-height: 20px;
		word-break: break-word;
		white-space: pre-wrap;
	}

	.item-content:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}

	textarea {
		width: 100%;
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 4px 8px;
		font-family: inherit;
		font-size: inherit;
		resize: vertical;
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
		font-size: 1rem;
		cursor: pointer;
		padding: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #666;
		border-radius: 4px;
	}

	.item-actions button:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.vote-btn {
		font-size: 0.8rem !important;
	}

	.voted {
		color: gold !important;
	}

	.vote-count {
		margin-left: 8px;
		padding: 0 6px;
		background: #f0f0f0;
		border-radius: 10px;
		font-size: 0.8rem;
		color: #666;
	}

	.bullet {
		font-size: 1rem;
		color: #ccc;
	}

	.item-children {
		margin-left: 0;
	}
</style>
