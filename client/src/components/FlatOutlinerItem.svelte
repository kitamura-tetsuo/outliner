<script lang="ts">
	import { Tree } from 'fluid-framework';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { getLogger } from '../lib/logger';
	import { Items } from '../schema/app-schema';
	import { editorOverlayStore } from '../stores/EditorOverlayStore';
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
		isPageTitle?: boolean; // ページタイトルかどうか
	}

	let { 
		model, 
		depth = 0, 
		currentUser = 'anonymous', 
		isReadOnly = false,
		isCollapsed = false,
		hasChildren = false,
		isPageTitle = false
	}: Props = $props();

	const dispatch = createEventDispatcher();

	// Stateの管理
	let isEditing = $state(false);
	let cursorVisible = $state(true);
	let selectionStart = $state(0);
	let selectionEnd = $state(0);
	let lastSelectionStart = $state(0);
	let lastSelectionEnd = $state(0);
	let lastCursorPosition = $state(0);

	let item = model.original;

	const text = new TreeSubscriber(
    item,
    "nodeChanged",
    () => item.text,
    value => {
			item.text = value;
    }
	);

	// 隠しテキストエリアのref
	let hiddenTextareaRef: HTMLTextAreaElement;
	// 表示エリアのref
	let displayRef: HTMLDivElement;
	// アイテム全体のDOMエレメントのref
	let itemRef: HTMLDivElement;

	// カーソル点滅用タイマー
	let cursorBlinkTimer: number;

	// カーソル点滅の開始
	function startCursorBlink() {
		cursorVisible = true;
		clearInterval(cursorBlinkTimer);
		cursorBlinkTimer = setInterval(() => {
			cursorVisible = !cursorVisible;
		}, 500) as unknown as number;
	}

	// カーソル点滅の停止
	function stopCursorBlink() {
		clearInterval(cursorBlinkTimer);
		cursorVisible = false;
	}

	function getClickPosition(event: MouseEvent, content: string): number {
		const element = (event.currentTarget || event.target) as HTMLElement;
		const rect = element.getBoundingClientRect();
		const x = event.clientX - rect.left;

		// クリック位置に最も近い文字位置を見つける
		const span = document.createElement('span');
		span.style.font = window.getComputedStyle(element).font;
		document.body.appendChild(span);

		let bestPosition = 0;
		let minDistance = Infinity;

		for (let i = 0; i <= content.length; i++) {
			span.textContent = content.slice(0, i);
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
		
		// テキストエリアの内容を同期
		hiddenTextareaRef.value = text.current;
		hiddenTextareaRef.focus();
		
		let cursorPosition = 0;
		
		if (event) {
			// クリック位置に基づいてカーソル位置を設定
			cursorPosition = getClickPosition(event, text.current);
			hiddenTextareaRef.setSelectionRange(cursorPosition, cursorPosition);
		} else {
			// デフォルトでは末尾にカーソルを配置
			cursorPosition = text.current.length;
			hiddenTextareaRef.setSelectionRange(cursorPosition, cursorPosition);
		}
		
		selectionStart = selectionEnd = cursorPosition;
		
		// カーソル位置をストアに設定
		editorOverlayStore.setActiveItem(model.id);
		editorOverlayStore.setCursor({
			itemId: model.id,
			offset: cursorPosition,
			isActive: true,
			userId: 'local'
		});
		
		startCursorBlink();
	}

	// テキストエリア用のキーダウンハンドラ
	function handleKeyDown(event: KeyboardEvent) {
		lastSelectionStart = hiddenTextareaRef.selectionStart;
		lastSelectionEnd = hiddenTextareaRef.selectionEnd;
		lastCursorPosition = hiddenTextareaRef.selectionDirection === 'forward' ? 
			hiddenTextareaRef.selectionEnd : hiddenTextareaRef.selectionStart;
		
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			finishEditing();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			finishEditing();
		} else if (event.key === 'Tab') {
			event.preventDefault();
			event.stopPropagation();

			if (event.shiftKey) {
				dispatch('unindent', { itemId: model.id });
			} else {
				dispatch('indent', { itemId: model.id });
			}

			logger.info('Tab key processed in textarea');
		} else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
			setTimeout(() => {
				updateSelectionAndCursor(event.shiftKey);
			}, 0);
		}
		
		setTimeout(() => {
			updateSelectionAndCursor(event.shiftKey);
		}, 0);
	}

	// カーソル位置と選択範囲を更新する共通関数
	function updateSelectionAndCursor(isShiftKey = false) {
		if (!hiddenTextareaRef) return;
		
		const currentStart = hiddenTextareaRef.selectionStart;
		const currentEnd = hiddenTextareaRef.selectionEnd;
		selectionStart = currentStart;
		selectionEnd = currentEnd;
		
		if (currentStart === currentEnd) {
			lastCursorPosition = currentStart;
			
			editorOverlayStore.setCursor({
				itemId: model.id,
				offset: currentStart,
				isActive: true,
				userId: 'local'
			});
			editorOverlayStore.setSelection({
				itemId: model.id,
				startOffset: 0,
				endOffset: 0,
				userId: 'local'
			});
		} else {
			let cursorAtStart = false;
			let isReversed = false;
			
			if (isShiftKey) {
				if (currentStart !== lastSelectionStart) {
					cursorAtStart = true;
					isReversed = true;
				} else if (currentEnd !== lastSelectionEnd) {
					cursorAtStart = false;
					isReversed = false;
				} else {
					cursorAtStart = lastCursorPosition === lastSelectionStart;
					isReversed = cursorAtStart;
				}
			} else {
				isReversed = hiddenTextareaRef.selectionDirection === 'backward';
				cursorAtStart = isReversed;
			}
			
			const cursorOffset = cursorAtStart ? currentStart : currentEnd;
			lastCursorPosition = cursorOffset;
			
			editorOverlayStore.setCursor({
				itemId: model.id,
				offset: cursorOffset,
				isActive: true,
				userId: 'local'
			});
			editorOverlayStore.setSelection({
				itemId: model.id,
				startOffset: Math.min(currentStart, currentEnd),
				endOffset: Math.max(currentStart, currentEnd),
				userId: 'local',
				isReversed: isReversed
			});
		}
		
		lastSelectionStart = currentStart;
		lastSelectionEnd = currentEnd;
	}

	// アイテム全体のキーダウンイベントハンドラ
	function handleItemKeyDown(event: KeyboardEvent) {
		if (isEditing) return;

		if (event.key === 'Tab') {
			event.preventDefault();
			event.stopPropagation();

			if (event.shiftKey) {
				dispatch('unindent', { itemId: model.id });
				logger.info(`Unindent dispatched`);
			} else {
				dispatch('indent', { itemId: model.id });
				logger.info(`Indent dispatched`);
			}
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			startEditing();
		}
	}

	function handleInput() {
		text.current = hiddenTextareaRef.value;
		
		updateSelectionAndCursor();
	}

	function finishEditing() {
		isEditing = false;
		stopCursorBlink();
		
		editorOverlayStore.clearCursorAndSelection();
		editorOverlayStore.setActiveItem(null);
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

	function handleClick(event: MouseEvent) {
		startEditing(event);
	}

	onMount(() => {
		document.addEventListener('click', (e) => {
			if (isEditing && displayRef && !displayRef.contains(e.target as Node)) {
				finishEditing();
			}
		});
	});

	onDestroy(() => {
		stopCursorBlink();
		
		editorOverlayStore.clearCursorAndSelection();
	});
</script>

<div
	class="outliner-item"
	class:page-title={isPageTitle}
	style="margin-left: {depth * 20}px"
	tabindex="0"
	onkeydown={handleItemKeyDown}
	bind:this={itemRef}
	data-item-id={model.id}
>
	<div class="item-header">
		{#if !isPageTitle}
			{#if hasChildren}
				<button class="collapse-btn" onclick={toggleCollapse}>
					{isCollapsed ? '▶' : '▼'}
				</button>
			{:else}
				<span class="bullet">•</span>
			{/if}
		{/if}

		<div class="item-content-container">
			<!-- 隠しテキストエリア -->
			<textarea
				bind:this={hiddenTextareaRef}
				class="hidden-textarea"
				onkeydown={handleKeyDown}
				oninput={handleInput}
				onblur={finishEditing}
			></textarea>
			
			<!-- 表示用の要素 -->
			<div
				bind:this={displayRef}
				class="item-content"
				class:page-title-content={isPageTitle}
				onclick={handleClick}
				class:editing={isEditing}
			>
				{#if text.current}
					<span class="item-text">{text.current}</span>
				{:else}
					<span class="empty-text">{isPageTitle ? '無題のページ' : '空白のノート'}</span>
				{/if}
				
				{#if !isPageTitle && model.votes.length > 0}
					<span class="vote-count">{model.votes.length}</span>
				{/if}
			</div>
		</div>

		{#if !isPageTitle}
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
		{/if}
	</div>
</div>

<style>
	.outliner-item {
		position: relative;
		margin: 0;
		padding-top: 4px;
		padding-bottom: 4px;
	}
	
	.page-title {
		margin-bottom: 10px;
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
		flex-shrink: 0;
	}

	.collapse-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-size: 0.7rem;
		color: #666;
	}

	.item-content-container {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.hidden-textarea {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		overflow: hidden;
		padding: 0;
		resize: none;
		z-index: 0;
		white-space: pre;
		pointer-events: auto;
	}

	.item-content {
		position: relative;
		cursor: text;
		padding: 2px 0;
		min-height: 20px;
		display: flex;
		align-items: center;
		word-break: break-word;
		width: 100%;
	}
	
	.page-title-content {
		font-size: 24px;
		font-weight: bold;
		min-height: 32px;
		border-bottom: 1px solid #eee;
		margin-bottom: 8px;
		padding-bottom: 8px;
	}
    
	.item-content.editing {
		outline: 1px solid #ccc;
		background-color: rgba(0, 0, 0, 0.02);
	}

	.item-text {
		flex: 1;
		white-space: pre-wrap;
		display: inline-block;
		min-width: 1px;
	}
    
	.empty-text {
		color: #999;
		font-style: italic;
	}

	.item-actions {
		display: flex;
		gap: 4px;
		opacity: 0;
		transition: opacity 0.2s;
		flex-shrink: 0;
	}

	.outliner-item:hover .item-actions,
	.outliner-item:focus-within .item-actions {
		opacity: 1;
	}

	.item-actions button {
		background: none;
		border: none;
		padding: 2px 4px;
		cursor: pointer;
		font-size: 0.8rem;
		color: #666;
		border-radius: 3px;
	}

	.item-actions button:hover {
		background-color: #f0f0f0;
	}

	.vote-btn {
		color: #ccc;
	}

	.vote-btn.voted {
		color: gold;
	}

	.vote-count {
		margin-left: 4px;
		background: #f0f0f0;
		border-radius: 8px;
		padding: 0 4px;
		font-size: 0.7rem;
		color: #666;
	}
    
	.cursor, .selection {
		display: none;
	}
</style> 