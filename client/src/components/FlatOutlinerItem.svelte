<script lang="ts">
	import { Tree } from 'fluid-framework';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
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
	let cursorVisible = $state(true);
	let selectionStart = $state(0);
	let selectionEnd = $state(0);

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
		
		if (event) {
			// クリック位置に基づいてカーソル位置を設定
			const position = getClickPosition(event, text.current);
			hiddenTextareaRef.setSelectionRange(position, position);
			selectionStart = selectionEnd = position;
		} else {
			// デフォルトでは末尾にカーソルを配置
			const textLength = text.current.length;
			hiddenTextareaRef.setSelectionRange(textLength, textLength);
			selectionStart = selectionEnd = textLength;
		}
		
		startCursorBlink();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			finishEditing();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			finishEditing();
		} else if (event.key === 'Tab') {
			// タブキーイベントはバブリングを止める
			event.preventDefault();
			event.stopPropagation();

			if (event.shiftKey) {
				// Unindent (Move up a level)
				dispatch('unindent', { itemId: model.id });
			} else {
				// Indent (Move down a level)
				dispatch('indent', { itemId: model.id });
			}

			logger.info('Tab key processed in textarea');
		}
		
		// 選択範囲の更新をマイクロタスク内で実行
		setTimeout(() => {
			selectionStart = hiddenTextareaRef.selectionStart;
			selectionEnd = hiddenTextareaRef.selectionEnd;
		}, 0);
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
		// テキストの更新
		text.current = hiddenTextareaRef.value;
		// 選択範囲の更新
		selectionStart = hiddenTextareaRef.selectionStart;
		selectionEnd = hiddenTextareaRef.selectionEnd;
	}

	function finishEditing() {
		isEditing = false;
		stopCursorBlink();
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

	// カーソル位置を描画するヘルパー関数
	function renderCursor() {
		if (!isEditing || !cursorVisible || selectionStart !== selectionEnd) {
			return '';
		}
		
		// 現在のカーソル位置までのテキストを取得
		const textBeforeCursor = text.current.substring(0, selectionStart);
		
		// カーソル位置の計算
		let cursorLeft = 0;
		if (displayRef) {
			// テキスト幅を測定
			const tempSpan = document.createElement('span');
			tempSpan.style.font = window.getComputedStyle(displayRef).font;
			tempSpan.style.visibility = 'hidden';
			tempSpan.style.position = 'absolute';
			tempSpan.style.whiteSpace = 'pre';
			tempSpan.textContent = textBeforeCursor;
			document.body.appendChild(tempSpan);
			cursorLeft = tempSpan.getBoundingClientRect().width;
			document.body.removeChild(tempSpan);
		}
		
		return `<span class="cursor" style="left: ${cursorLeft}px;"></span>`;
	}

	// 選択範囲を描画するヘルパー関数
	function renderSelection() {
		if (!isEditing || selectionStart === selectionEnd) {
			return '';
		}
		
		// 選択範囲の前のテキスト
		const textBefore = text.current.substring(0, Math.min(selectionStart, selectionEnd));
		// 選択されたテキスト
		const selectedText = text.current.substring(
			Math.min(selectionStart, selectionEnd),
			Math.max(selectionStart, selectionEnd)
		);
		
		let selectionLeft = 0;
		let selectionWidth = 0;
		
		if (displayRef) {
			// 位置を測定するための一時要素
			const tempSpan = document.createElement('span');
			tempSpan.style.font = window.getComputedStyle(displayRef).font;
			tempSpan.style.visibility = 'hidden';
			tempSpan.style.position = 'absolute';
			tempSpan.style.whiteSpace = 'pre';
			
			// 選択範囲前のテキスト幅を測定
			tempSpan.textContent = textBefore;
			document.body.appendChild(tempSpan);
			selectionLeft = tempSpan.getBoundingClientRect().width;
			
			// 選択テキストの幅を測定
			tempSpan.textContent = selectedText;
			selectionWidth = tempSpan.getBoundingClientRect().width;
			
			document.body.removeChild(tempSpan);
		}
		
		return `<span class="selection" style="left: ${selectionLeft}px; width: ${selectionWidth}px;"></span>`;
	}

	// テキストをエスケープしてHTML表示用に変換
	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;')
			.replace(/ /g, '&nbsp;')
			.replace(/\n/g, '<br>');
	}

	function handleClick(event: MouseEvent) {
		startEditing(event);
	}

	onMount(() => {
		// ドキュメント全体へのクリックイベントリスナを追加
		document.addEventListener('click', (e) => {
			// displayRef以外の領域をクリックしたらフォーカスを外す
			if (isEditing && displayRef && !displayRef.contains(e.target as Node)) {
				finishEditing();
			}
		});
	});

	onDestroy(() => {
		// クリーンアップ
		stopCursorBlink();
	});
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
				onclick={handleClick}
				class:editing={isEditing}
			>
				{#if text.current}
					<span class="item-text">{@html escapeHtml(text.current)}</span>
					{#if isEditing}
						<!-- カーソルと選択範囲の視覚的表現 -->
						{@html renderCursor() + renderSelection()}
					{/if}
				{:else}
					<span class="empty-text">空白のノート</span>
				{/if}
				
				{#if model.votes.length > 0}
					<span class="vote-count">{model.votes.length}</span>
				{/if}
			</div>
		</div>

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

	.item-content-container {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	.hidden-textarea {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		opacity: 0;
		overflow: hidden;
		padding: 0;
		resize: none;
		z-index: -1;
		white-space: pre;
	}

	.item-content {
		position: relative;
		cursor: text;
		padding: 2px 0;
		min-height: 20px;
		display: flex;
		align-items: center;
		word-break: break-word;
	}
    
	.item-content.editing {
		outline: 1px solid #ccc;
		background-color: rgba(0, 0, 0, 0.02);
	}

	.item-text {
		flex: 1;
		white-space: pre-wrap;
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
    
	.cursor {
		display: inline-block;
		width: 2px;
		height: 1.2em;
		background-color: #000;
		vertical-align: middle;
		animation: blink 1s infinite;
		position: absolute;
	}
    
	.selection {
		background-color: rgba(0, 120, 215, 0.3);
		position: absolute;
		height: 1.2em;
	}
    
	@keyframes blink {
		0%, 49% { opacity: 1; }
		50%, 100% { opacity: 0; }
	}
</style> 