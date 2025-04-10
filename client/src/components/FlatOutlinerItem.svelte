<script lang="ts">
	import { Tree } from 'fluid-framework';
	import { createEventDispatcher } from 'svelte';
	import { getLogger } from '../lib/logger';
	import { Items } from '../schema/app-schema';
	import type { OutlinerItemViewModel } from '../stores/OutlinerViewStore';
	import { TreeSubscriber } from "../stores/TreeSubscriber";

	const logger = getLogger();

	interface Props {
		// Props
		model: OutlinerItemViewModel;
		depth: number;
		currentUser?: string;
		isReadOnly?: boolean;
		isCollapsed?: boolean;
		hasChildren?: boolean;
	}

	let { 
		model, 
		depth = 0, 
		currentUser = 'anonymous', 
		isReadOnly = false,
		isCollapsed = false,
		hasChildren = false
	}: Props = $props();

	const dispatch = createEventDispatcher();

	// Stateの管理
	let isEditing = $state(false);

	let item = model.original;

	const text = new TreeSubscriber(
    item,
    "nodeChanged",
    () => item.text,
    value => {
			item.text = value;
    }
	);

	// テキストエリアのref
	let textareaRef: HTMLTextAreaElement;
	// アイテム全体のDOMエレメントのref
	let itemRef: HTMLDivElement;

	function getClickPosition(event: MouseEvent, text: string): number {
		const element = (event.currentTarget || event.target) as HTMLElement;
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
		dispatch('toggle-collapse', { itemId: model.id });
	}

	function startEditing(event?: MouseEvent) {
		if (isReadOnly) return;
		isEditing = true;

		// 非同期で要素が更新された後にフォーカスとキャレット位置を設定
		setTimeout(() => {
			if (textareaRef) {
				textareaRef.focus();
				if (event) {
					const position = getClickPosition(event, model.text);
					textareaRef.setSelectionRange(position, position);
				}
			}
		}, 0);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			finishEditing();
		} else if (event.key === 'Escape') {
			isEditing = false;
		} else if (event.key === 'Tab') {
			// タブキーイベントはバブリングを止める
			event.preventDefault();
			event.stopPropagation();

			if (event.shiftKey) {
				// Unindent (Move up a level)
				dispatch('unindent', { itemId: model.id, focusAfter: () => itemRef.focus() });
			} else {
				// Indent (Move down a level)
				dispatch('indent', { itemId: model.id, focusAfter: () => itemRef.focus() });
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
				dispatch('unindent', { itemId: model.id, focusAfter: () => itemRef.focus() });
				logger.info(`Unindent dispatched`);
			} else {
				dispatch('indent', { itemId: model.id, focusAfter: () => itemRef.focus() });
				logger.info(`Indent dispatched`);
			}
		}
	}

	function finishEditing() {
		isEditing = false;
	}

	function addNewItem() {
		if (!isReadOnly && model.original.items && Tree.is(model.original.items, Items)) {
			model.original.items.addNode(currentUser);
		}
	}

	function handleDelete() {
		if (isReadOnly) return;
		if (confirm('このアイテムを削除しますか？')) {
			model.original.delete();
		}
	}

	function toggleVote() {
		if (!isReadOnly) {
			model.original.toggleVote(currentUser);
		}
	}
</script>

<div
	class="outliner-item"
	style="margin-left: {depth * 20}px"
	tabindex="0"
	onkeydown={handleItemKeyDown}
	bind:this={itemRef}
	data-item-id={model.id}
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
				bind:value={text.current}
				onkeydown={handleKeyDown}
				onblur={finishEditing}
				rows={Math.max(1, text.current.split('\n').length)}
				autofocus
			></textarea>
		{:else}
			<div class="item-content" onclick={startEditing}>
				<span class="item-text">{model.text || '空白のノート'}</span>

				{#if model.votes.length > 0}
					<span class="vote-count">{model.votes.length}</span>
				{/if}
			</div>
		{/if}

		<div class="item-actions">
			<button onclick={addNewItem} title="新しいアイテムを追加">+</button>
			<button onclick={handleDelete} title="削除">×</button>
			<button
				onclick={toggleVote}
				class="vote-btn"
				class:voted={model.votes.includes(currentUser)}
				title="投票"
			>
				⭐
			</button>
		</div>
	</div>
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
</style> 