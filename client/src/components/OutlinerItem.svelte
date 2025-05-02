<script lang="ts">
	import { Tree } from 'fluid-framework';
	import { createEventDispatcher, onMount } from 'svelte';
	import { Items } from '../schema/app-schema';
	import { editorOverlayStore } from '../stores/EditorOverlayStore.svelte';
	import type { OutlinerItemViewModel } from "../stores/OutlinerViewModel";
	import { TreeSubscriber } from "../stores/TreeSubscriber";
	interface Props {
		model: OutlinerItemViewModel;
		depth?: number;
		currentUser?: string;
		isReadOnly?: boolean;
		isCollapsed?: boolean;
		hasChildren?: boolean;
		isPageTitle?: boolean;
		index: number;
	}

	let {
		model,
		depth = 0,
		currentUser = 'anonymous',
		isReadOnly = false,
		isCollapsed = false,
		hasChildren = false,
		isPageTitle = false,
		index
	}: Props = $props();

	const dispatch = createEventDispatcher();

	// Stateの管理
	let isEditing = $state(false);
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

	// 表示エリアのref
	let displayRef: HTMLDivElement;
	// アイテム全体のDOMエレメントのref
	let itemRef: HTMLDivElement;
	let lastHeight = 0;

	// グローバルテキストエリアの参照
	let hiddenTextareaRef: HTMLTextAreaElement;

	// グローバル textarea 要素を参照にセット
	onMount(() => {
		const globalTextarea = document.querySelector('.global-textarea') as HTMLTextAreaElement;
		if (!globalTextarea) return;
		hiddenTextareaRef = globalTextarea;
	});

	function getClickPosition(event: MouseEvent, content: string): number {
		const x = event.clientX;
		const y = event.clientY;
		// テキスト要素を特定
		const textEl = displayRef.querySelector('.item-text') as HTMLElement;
		// Caret APIを試す
		if (textEl && (document.caretRangeFromPoint || (document as any).caretPositionFromPoint)) {
			let range: Range | null = null;
			if (document.caretRangeFromPoint) {
				range = document.caretRangeFromPoint(x, y);
			} else {
				const posInfo = (document as any).caretPositionFromPoint(x, y);
				if (posInfo) {
					range = document.createRange();
					range.setStart(posInfo.offsetNode, posInfo.offset);
					range.collapse(true);
				}
			}
			if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
				// テキストノード内オフセットを返す
				return Math.min(Math.max(0, range.startOffset), content.length);
			}
		}
		// フォールバック: spanを使った幅測定
		const rect = displayRef.getBoundingClientRect();
		const relX = x - rect.left;
		const span = document.createElement('span');
		const style = window.getComputedStyle(textEl || displayRef);
		span.style.fontFamily = style.fontFamily;
		span.style.fontSize = style.fontSize;
		span.style.fontWeight = style.fontWeight;
		span.style.letterSpacing = style.letterSpacing;
		span.style.whiteSpace = 'pre';
		span.style.visibility = 'hidden';
		span.style.position = 'absolute';
		document.body.appendChild(span);
		let best = 0;
		let minDist = Infinity;
		for (let i = 0; i <= content.length; i++) {
			span.textContent = content.slice(0, i);
			const w = span.getBoundingClientRect().width;
			const d = Math.abs(w - relX);
			if (d < minDist) {
				minDist = d;
				best = i;
			}
		}
		document.body.removeChild(span);
		return best;
	}

	function toggleCollapse() {
		dispatch('toggle-collapse', { itemId: model.id });
	}

	function startEditing(event?: MouseEvent, initialCursorPosition?: number) {
		if (isReadOnly) return;
		isEditing = true;

		// グローバル textarea を取得（ストアから、なければDOMからフォールバック）
		let textareaEl = editorOverlayStore.getTextareaRef();
		if (!textareaEl) {
			textareaEl = document.querySelector('.global-textarea') as HTMLTextAreaElement | null;
			if (!textareaEl) {
				console.error('Global textarea not found');
				return;
			}
			// ストアに再登録
			editorOverlayStore.setTextareaRef(textareaEl);
		}
		// テキスト内容を同期
		textareaEl.value = text.current;
		textareaEl.focus();

		let cursorPosition = initialCursorPosition;

		if (event) {
			// クリック位置に基づいてカーソル位置を設定
			cursorPosition = getClickPosition(event, text.current);
		} else if (initialCursorPosition === undefined) {
			// デフォルトでは末尾にカーソルを配置（外部から指定がない場合のみ）
			cursorPosition = text.current.length;
		}

		if (cursorPosition !== undefined) {
			// カーソル位置を textarea に設定
			textareaEl.setSelectionRange(cursorPosition, cursorPosition);
		}

		// 現在アクティブなアイテムのカーソルをクリア
		const activeItemId = editorOverlayStore.getActiveItem();
		if (activeItemId && activeItemId !== model.id) {
			editorOverlayStore.clearCursorForItem(activeItemId);
		}

		// 全てのカーソルをクリアしてから新しいカーソルを設定
		// Alt+Clickでのマルチカーソル追加以外では、常に単一カーソルになるようにする
		editorOverlayStore.clearCursorAndSelection('local');

		// 現在のアイテムの既存のカーソルをクリア
		editorOverlayStore.clearCursorForItem(model.id);

		// アクティブアイテムを設定
		editorOverlayStore.setActiveItem(model.id);

		// 新しいカーソルを設定
		editorOverlayStore.setCursor({
			itemId: model.id,
			offset: cursorPosition !== undefined ? cursorPosition : 0,
			isActive: true,
			userId: 'local'
		});

		// カーソル点滅を開始
		editorOverlayStore.startCursorBlink();
	}


	// カーソル位置と選択範囲を更新する共通関数
	function updateSelectionAndCursor(isShiftKey = false) {
		if (!hiddenTextareaRef) return;

		const currentStart = hiddenTextareaRef.selectionStart;
		const currentEnd = hiddenTextareaRef.selectionEnd;

		if (currentStart === currentEnd) {
			lastCursorPosition = currentStart;

			editorOverlayStore.setCursor({
				itemId: model.id,
				offset: currentStart,
				isActive: true,
				userId: 'local'
			});
			editorOverlayStore.setSelection({
				startItemId: model.id,
				endItemId: model.id,
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
				startItemId: model.id,
				endItemId: model.id,
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

	function finishEditing() {
		isEditing = false;
		editorOverlayStore.stopCursorBlink();

		// カーソルのみクリアし、跨いだ選択は残す
		editorOverlayStore.clearCursorForItem(model.id);
		editorOverlayStore.setActiveItem(null);
	}

	function addNewItem() {
		if (!isReadOnly && model.original.items && Tree.is(model.original.items, Items)) {
			model.original.items.addNode(currentUser,0);
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

	// クリック時のハンドリング: Alt+Click でマルチカーソル追加、それ以外は編集開始
	function handleClick(event: MouseEvent) {
		// Alt+Click: 新しいカーソルを追加
		if (event.altKey) {
			event.preventDefault();
			event.stopPropagation();
			const pos = getClickPosition(event, text.current);
			const existing = editorOverlayStore.getItemCursorsAndSelections(model.id).cursors;
			if (existing.some(c => c.offset === pos && c.userId === 'local')) {
				return;
			}
			editorOverlayStore.addCursor({ itemId: model.id, offset: pos, isActive: true, userId: 'local' });
			// アクティブアイテムを設定
			editorOverlayStore.setActiveItem(model.id);
			// 編集用隠し textarea にフォーカス
			hiddenTextareaRef?.focus();
			return;
		}
		// 通常クリック: 編集開始
		event.preventDefault();
		event.stopPropagation();

		// 現在アクティブなアイテムのカーソルをクリア
		const activeItemId = editorOverlayStore.getActiveItem();
		if (activeItemId) {
			editorOverlayStore.clearCursorForItem(activeItemId);
		}

		// 全てのカーソルをクリア
		editorOverlayStore.clearCursorAndSelection('local');

		// 現在のアイテムの既存のカーソルをクリア
		editorOverlayStore.clearCursorForItem(model.id);

		// 編集開始
		startEditing(event);
	}

	onMount(() => {
		// テキストエリアがレンダリングされているか確認
		if (!hiddenTextareaRef) {
			console.error('Hidden textarea reference is not available');
			return;
		}

		// クリック外のイベントリスナー
		const handleOutsideClick = (e: MouseEvent) => {
			if (isEditing && displayRef && !displayRef.contains(e.target as Node)) {
				finishEditing();
			}
		};
		document.addEventListener('click', handleOutsideClick);

		// カーソル位置を保持してアイテム間をナビゲートするためのイベントリスナー
		const handleFocusItem = (event: CustomEvent) => {
			// shiftKeyと方向も取得
			const { cursorScreenX, shiftKey, direction } = event.detail;

			if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
				console.log(`Received focus-item event for ${model.id} with X: ${cursorScreenX}px`);
			}

			// アイテムがすでに編集中の場合は処理を省略
			if (isEditing) {
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log(`Item ${model.id} is already in edit mode`);
				}
				return;
			}

			// 編集モードを開始
			isEditing = true;

			// テキストエリアの内容を同期
			hiddenTextareaRef.value = text.current;

			// カーソル位置を決定
			let textPosition = 0;

			// 方向に基づいてカーソル位置を設定
			if (direction === 'up') {
				// 上方向の移動の場合、末尾に配置
				textPosition = text.current.length;
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log(`Direction 'up': positioning cursor at end: ${textPosition}`);
				}
			} else if (direction === 'down') {
				// 下方向の移動の場合、先頭に配置
				textPosition = 0;
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log(`Direction 'down': positioning cursor at start: ${textPosition}`);
				}
			} else {
				// 特殊な値の処理
				if (cursorScreenX === Number.MAX_SAFE_INTEGER) {
					// 末尾位置
					textPosition = text.current.length;
					if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
						console.log(`Using special MAX_SAFE_INTEGER value to position cursor at end: ${textPosition}`);
					}
				} else if (cursorScreenX === 0) {
					// 先頭位置
					textPosition = 0;
					if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
						console.log(`Using special 0 value to position cursor at start`);
					}
				} else if (cursorScreenX !== undefined) {
					// ピクセル座標からテキスト位置を計算
					textPosition = pixelPositionToTextPosition(cursorScreenX);

					if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
						console.log(`Calculated text position ${textPosition} from X: ${cursorScreenX}`);
					}
				} else {
					// デフォルトは末尾
					textPosition = text.current.length;
					if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
						console.log(`No cursor X provided, using text end: ${textPosition}`);
					}
				}
			}

			// 一連の処理をリクエストアニメーションフレームで最適化
			requestAnimationFrame(() => {
				try {
					// まずフォーカスを設定（最優先）
					hiddenTextareaRef.focus();

					// ローカル変数を更新 (shiftKey時はクロスアイテム選択拡張)
					if (!shiftKey) {
						lastSelectionStart = lastSelectionEnd = textPosition;
						lastCursorPosition = textPosition;
					} else if (direction === 'down' || direction === 'right') {
						// 次アイテム: 行頭からカーソル位置まで選択
						lastSelectionStart = 0;
						lastSelectionEnd = textPosition;
						lastCursorPosition = textPosition;
					} else if (direction === 'up' || direction === 'left') {
						// 前アイテム: カーソル位置から行末まで選択
						lastSelectionStart = textPosition;
						lastSelectionEnd = hiddenTextareaRef.value.length;
						lastCursorPosition = textPosition;
					}

					// 再度カーソルが表示されていることを確認
					editorOverlayStore.startCursorBlink();

					// editorOverlayStoreにアクティブアイテムとカーソル位置を設定（選択範囲はOutlinerTree側で管理）
					editorOverlayStore.setCursor({
						itemId: model.id,
						offset: textPosition,
						isActive: true,
						userId: 'local'
					});

					// カーソル位置設定を実行
					setCaretPosition(textPosition);

					if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
						console.log(`Focus and cursor position set for item ${model.id} at position ${textPosition}`);
					}
				} catch (error) {
					console.error('Error setting focus and cursor position:', error);
				}
			});
		};

		// 編集完了イベントハンドラ
		const handleFinishEdit = () => {
			if (isEditing) {
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log(`Finishing edit for item ${model.id} via custom event`);
				}
				finishEditing();
			}
		};

		// コンポーネント要素にイベントリスナーを追加
		if (itemRef) {
			itemRef.addEventListener('focus-item', handleFocusItem as EventListener);
			itemRef.addEventListener('finish-edit', handleFinishEdit as EventListener);

			if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
				console.log(`Added event listeners to item element with ID: ${model.id}`);
			}
		} else {
			console.error(`itemRef is not available for ${model.id}`);
		}

		// クリーンアップ関数
		return () => {
			if (itemRef) {
				itemRef.removeEventListener('focus-item', handleFocusItem as EventListener);
				itemRef.removeEventListener('finish-edit', handleFinishEdit as EventListener);
			}
			document.removeEventListener('click', handleOutsideClick);

			editorOverlayStore.clearCursorAndSelection();
		};
	});

	// ピクセル座標からテキスト位置を計算する関数
	function pixelPositionToTextPosition(screenX: number): number {
		// 特殊な値の処理
		if (screenX === Number.MAX_SAFE_INTEGER) {
			// 末尾位置を表す特殊値
			return text.current.length;
		} else if (screenX === 0) {
			// 先頭位置を表す特殊値
			return 0;
		}

		if (!displayRef) return 0;

		const textElement = displayRef.querySelector('.item-text') as HTMLElement;
		if (!textElement) return 0;

		const currentText = text.current || ''; // 現在のテキストを取得
		if (currentText.length === 0) return 0;

		// テキスト要素の位置を取得
		const textRect = textElement.getBoundingClientRect();

		// スクリーンX座標からテキスト要素相対位置を計算
		const relativeX = screenX - textRect.left;

		if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
			console.log(`Converting pixel position: screenX=${screenX}, textLeft=${textRect.left}, relativeX=${relativeX}`);
		}

		// 境界値チェック
		if (relativeX <= 0) return 0;
		if (relativeX >= textRect.width) return currentText.length;

		// 測定用のスパン要素を作成
		const span = document.createElement('span');
		span.style.font = window.getComputedStyle(textElement).font;
		span.style.whiteSpace = 'pre';
		span.style.visibility = 'hidden';
		span.style.position = 'absolute';
		document.body.appendChild(span);

		let bestPos = 0;
		let bestDistance = Infinity;

		// バイナリサーチでおおよその位置を特定
		let left = 0;
		let right = currentText.length;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);

			span.textContent = currentText.substring(0, mid);
			const width = span.getBoundingClientRect().width;
			const distance = Math.abs(width - relativeX);

			if (distance < bestDistance) {
				bestDistance = distance;
				bestPos = mid;
			}

			if (width < relativeX) {
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		// 近傍をより詳細に探索
		const rangeStart = Math.max(0, bestPos - 3);
		const rangeEnd = Math.min(currentText.length, bestPos + 3);

		for (let i = rangeStart; i <= rangeEnd; i++) {
			span.textContent = currentText.substring(0, i);
			const width = span.getBoundingClientRect().width;
			const distance = Math.abs(width - relativeX);

			if (distance < bestDistance) {
				bestDistance = distance;
				bestPos = i;
			}
		}

		document.body.removeChild(span);

		if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
			console.log(`Found best text position: ${bestPos} for text "${currentText}"`);
		}

		return bestPos;
	}

	// 指定したテキスト位置にカーソルを設定する関数
	function setCaretPosition(position: number) {
		if (!hiddenTextareaRef) return;

		try {
			// 範囲内に収める
			const safePosition = Math.min(Math.max(0, position), hiddenTextareaRef.value.length);

			// フォーカスを確保
			hiddenTextareaRef.focus();

			// カーソル位置を設定（複数回試行）
			hiddenTextareaRef.setSelectionRange(safePosition, safePosition, 'none');

			// 確実に設定されるよう、少し遅延後にもう一度試行
			setTimeout(() => {
				if (document.activeElement === hiddenTextareaRef) {
					hiddenTextareaRef.setSelectionRange(safePosition, safePosition, 'none');
				}
			}, 0);

			// ローカル変数を更新
			lastSelectionStart = lastSelectionEnd = safePosition;
			lastCursorPosition = safePosition;

			// ストアにカーソル位置を設定
			editorOverlayStore.setCursor({
				itemId: model.id,
				offset: safePosition,
				isActive: true,
				userId: 'local'
			});

			// 選択範囲をクリア
			editorOverlayStore.setSelection({
				startItemId: model.id,
				endItemId: model.id,
				startOffset: 0,
				endOffset: 0,
				userId: 'local'
			});

			if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
				console.log(`Cursor position set to ${safePosition} in setCaretPosition function`);
			}
		} catch (error) {
			console.error('Error setting caret position:', error);
		}
	}

	// 外部から呼び出されるカーソル位置設定メソッド
	export function setSelectionPosition(start: number, end: number = start) {
		if (!hiddenTextareaRef || !isEditing) return;

		hiddenTextareaRef.setSelectionRange(start, end);
		lastSelectionStart = start;
		lastSelectionEnd = end;
		lastCursorPosition = end;

		updateSelectionAndCursor();
		editorOverlayStore.startCursorBlink();
	}


	// 他のアイテムに移動するイベントを発火する


	// ResizeObserverを使用して要素の高さ変更を監視
	onMount(() => {
		const resizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				const newHeight = entry.contentRect.height;
				if (newHeight !== lastHeight) {
					lastHeight = newHeight;
					dispatch('resize', {
						index,
						height: newHeight
					});
				}
			}
		});

		if (itemRef) {
			resizeObserver.observe(itemRef);
			// 初期高さを通知
			dispatch('resize', {
				index,
				height: itemRef.getBoundingClientRect().height
			});
		}

		return () => {
			resizeObserver.disconnect();
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="outliner-item"
	class:page-title={isPageTitle}
	style="margin-left: {depth * 20}px"
	onclick={handleClick}
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
			<!-- 表示用の要素 -->
			<div
				bind:this={displayRef}
				class="item-content"
				class:page-title-content={isPageTitle}
				class:editing={isEditing}
			>
					<span class="item-text" class:title-text={isPageTitle}>{text.current}</span>
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

	.title-text {
		font-size: 1.5em;
		font-weight: bold;
		color: #333;
	}

	.page-title {
		margin-bottom: 1.5em;
		border-bottom: 1px solid #eee;
		padding-bottom: 0.5em;
	}

	.page-title-content {
		font-size: 1.2em;
	}
</style>