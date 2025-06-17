<script lang="ts">
	import { Tree } from 'fluid-framework';
	import { createEventDispatcher, onMount } from 'svelte';
	import { Items } from '../schema/app-schema';
	import { editorOverlayStore } from '../stores/EditorOverlayStore.svelte';
	import type { OutlinerItemViewModel } from "../stores/OutlinerViewModel";
	import { TreeSubscriber } from "../stores/TreeSubscriber";
	import { ScrapboxFormatter } from '../utils/ScrapboxFormatter';
	import { store } from '../stores/store.svelte';
	import { findItemById, getItemPath } from '../utils/treeUtils';
	import TableEmbed from './TableEmbed.svelte';
	import ChartEmbed from './ChartEmbed.svelte';
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
	let lastSelectionStart = $state(0);
	let lastSelectionEnd = $state(0);
	let lastCursorPosition = $state(0);

	// 注: 編集モードフラグはカーソル状態から導出されるため、独立した変数は不要
	// 代わりに hasActiveCursor() 関数を使用

	// ドラッグ関連の状態
	let isDragging = $state(false);
	let dragStartPosition = $state(0);
	let isDragSelectionMode = $state(false);
	let isDropTarget = $state(false);
	let dropTargetPosition = $state<'top' | 'middle' | 'bottom' | null>(null);

        let item = model.original;
        let aliasPath = $state("");
        let aliasUrl = $state("");

        function getAliasText(id: string): string {
                const project = store.project;
                if (!project) return "";
                const target = findItemById(project.items as Items, id);
                return target ? target.text : "";
        }

        function getAliasTarget(id: string) {
                const project = store.project;
                if (!project) return undefined;
                return findItemById(project.items as Items, id);
        }

        $effect(() => {
                if (!item.aliasId) {
                        aliasPath = "";
                        aliasUrl = "";
                        return;
                }
                const project = store.project;
                if (!project) return;
                const info = getItemPath(project, item.aliasId);
                if (info) {
                        aliasPath = info.path.join(" / ");
                        aliasUrl = `/${project.title}/${info.pageName}`;
                } else {
                        aliasPath = "";
                        aliasUrl = "";
                }
        });

        const text = new TreeSubscriber(
    item,
    "nodeChanged",
    () => item.aliasId ? getAliasText(item.aliasId) : item.text,
    value => {
                        if (item.aliasId) {
                            const target = getAliasTarget(item.aliasId);
                            if (target) target.updateText(value);
                        } else {
                            item.updateText(value);
                        }
    }
        );

	// 表示エリアのref
	let displayRef: HTMLDivElement;
	// アイテム全体のDOMエレメントのref
	let itemRef: HTMLDivElement;
	let lastHeight = 0;

	// グローバルテキストエリアの参照
	let hiddenTextareaRef: HTMLTextAreaElement;

	// アイテムにカーソルがあるかどうかを判定する
	function hasActiveCursor(): boolean {
		// カーソル状態に基づく判定
		return hasCursorBasedOnState();
	}

	// カーソル状態に基づいて判定する関数
	function hasCursorBasedOnState(): boolean {
		// アクティブなアイテムかどうか
		const activeItemId = editorOverlayStore.getActiveItem();
		if (activeItemId === model.id) return true;

		// カーソルがあるかどうか
		const cursors = editorOverlayStore.getItemCursorsAndSelections(model.id).cursors;
		return cursors.length > 0;
	}

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
		// テキスト要素がない場合はコンテンツ全体を使用
		const targetElement = textEl || displayRef;
		const rect = targetElement.getBoundingClientRect();
		const relX = x - rect.left;

		// クリック位置がテキスト領域外の場合の処理
		if (relX < 0) {
			return 0; // テキストの左側をクリックした場合は先頭
		}

		const span = document.createElement('span');
		const style = window.getComputedStyle(targetElement);
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
		let totalWidth = 0;

		// 各文字位置での幅を測定
		for (let i = 0; i <= content.length; i++) {
			span.textContent = content.slice(0, i);
			const w = span.getBoundingClientRect().width;
			const d = Math.abs(w - relX);
			if (d < minDist) {
				minDist = d;
				best = i;
			}
			// 最後の文字位置での幅を記録
			if (i === content.length) {
				totalWidth = w;
			}
		}

		document.body.removeChild(span);

		// テキストの右側をクリックした場合は末尾に配置
		if (relX > totalWidth) {
			return content.length;
		}

		return best;
	}

	function toggleCollapse() {
		dispatch('toggle-collapse', { itemId: model.id });
	}

	/**
	 * カーソルを設定する
	 * @param event マウスイベント（クリック位置からカーソル位置を計算）
	 * @param initialCursorPosition 初期カーソル位置（指定がある場合）
	 */
	function startEditing(event?: MouseEvent, initialCursorPosition?: number) {
		if (isReadOnly) return;

		// グローバル textarea を取得（ストアから、なければDOMからフォールバック）
		let textareaEl = editorOverlayStore.getTextareaRef();
		console.log('OutlinerItem startEditing: textareaEl from store:', !!textareaEl);
		if (!textareaEl) {
			textareaEl = document.querySelector('.global-textarea') as HTMLTextAreaElement | null;
			console.log('OutlinerItem startEditing: textareaEl from DOM:', !!textareaEl);
			if (!textareaEl) {
				console.error('Global textarea not found');
				return;
			}
			// ストアに再登録
			editorOverlayStore.setTextareaRef(textareaEl);
		}

		// グローバルテキストエリアにフォーカスを設定（最優先）
		textareaEl.focus();
		console.log('OutlinerItem startEditing: Focus set to global textarea, activeElement:', document.activeElement === textareaEl);

		// フォーカス確保のための追加試行
		requestAnimationFrame(() => {
			textareaEl.focus();
			console.log('OutlinerItem startEditing: RAF focus set, activeElement:', document.activeElement === textareaEl);

			setTimeout(() => {
				textareaEl.focus();
				const isFocused = document.activeElement === textareaEl;
				console.log('OutlinerItem startEditing: Final focus set, focused:', isFocused);
			}, 10);
		});
		// テキスト内容を同期
		console.log('OutlinerItem startEditing: setting textarea value to:', text.current);
		textareaEl.value = text.current;
		console.log('OutlinerItem startEditing: calling focus()');
		textareaEl.focus();
		console.log('OutlinerItem startEditing: focus called, activeElement:', document.activeElement?.tagName, document.activeElement?.className);

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

		// Alt+Clickで追加されたカーソルを保持するかどうかを判断
		// event が undefined または Alt キーが押されていない場合は通常の削除処理
		const preserveAltClick = event?.altKey === true;

		// デバッグ情報
		if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
			console.log(`startEditing called with preserveAltClick=${preserveAltClick}`);
		}

		// 全てのカーソルをクリアしてから新しいカーソルを設定
		// Alt+Clickでのマルチカーソル追加の場合は、既存のカーソルを保持する
		editorOverlayStore.clearCursorAndSelection('local', false, preserveAltClick);

		// 現在のアイテムの既存のカーソルをクリア（Alt+Clickの場合は保持）
		if (!preserveAltClick) {
			editorOverlayStore.clearCursorForItem(model.id);
		}

		// アクティブアイテムを設定
		editorOverlayStore.setActiveItem(model.id);

		// 新しいカーソルを設定
		const cursorId = editorOverlayStore.setCursor({
			itemId: model.id,
			offset: cursorPosition !== undefined ? cursorPosition : 0,
			isActive: true,
			userId: 'local'
		});

		console.log('OutlinerItem startEditing: Cursor set with ID:', cursorId, 'at position:', cursorPosition);

		// カーソル点滅を開始
		editorOverlayStore.startCursorBlink();

		// フォーカスを再確認
		if (document.activeElement !== textareaEl) {
			console.log('OutlinerItem startEditing: Re-focusing textarea');
			textareaEl.focus();
		}

		console.log('OutlinerItem startEditing: Final state - activeElement:', document.activeElement === textareaEl, 'cursorId:', cursorId);
	}


	/**
	 * カーソル位置と選択範囲を更新する共通関数
	 */
	function updateSelectionAndCursor() {
		if (!hiddenTextareaRef) return;

		const currentStart = hiddenTextareaRef.selectionStart;
		const currentEnd = hiddenTextareaRef.selectionEnd;

		// 選択範囲がない場合
		if (currentStart === currentEnd) {
			// カーソル位置を設定
			editorOverlayStore.setCursor({
				itemId: model.id,
				offset: currentStart,
				isActive: true,
				userId: 'local'
			});

			// 選択範囲をクリア
			const selections = Object.values(editorOverlayStore.selections).filter(s =>
				s.userId === 'local' && s.startItemId === model.id && s.endItemId === model.id
			);

			if (selections.length > 0) {
				// 選択範囲を削除
				editorOverlayStore.selections = Object.fromEntries(
					Object.entries(editorOverlayStore.selections).filter(([_, s]) =>
						!(s.userId === 'local' && s.startItemId === model.id && s.endItemId === model.id)
					)
				);
			}

			// グローバルテキストエリアの選択範囲をクリア
			if (hiddenTextareaRef) {
				hiddenTextareaRef.setSelectionRange(currentStart, currentStart);
			}
		} else {
			// 選択範囲がある場合
			const isReversed = hiddenTextareaRef.selectionDirection === 'backward';
			const cursorOffset = isReversed ? currentStart : currentEnd;

			// カーソル位置を設定
			editorOverlayStore.setCursor({
				itemId: model.id,
				offset: cursorOffset,
				isActive: true,
				userId: 'local'
			});

			// 選択範囲を設定
			editorOverlayStore.setSelection({
				startItemId: model.id,
				endItemId: model.id,
				startOffset: Math.min(currentStart, currentEnd),
				endOffset: Math.max(currentStart, currentEnd),
				userId: 'local',
				isReversed: isReversed
			});

			// グローバルテキストエリアの選択範囲を設定
			if (hiddenTextareaRef) {
				hiddenTextareaRef.setSelectionRange(
					currentStart,
					currentEnd,
					isReversed ? 'backward' : 'forward'
				);
			}
		}

		// ローカル変数を更新
		lastSelectionStart = currentStart;
		lastSelectionEnd = currentEnd;
		lastCursorPosition = currentStart === currentEnd ? currentStart :
			(hiddenTextareaRef.selectionDirection === 'backward' ? currentStart : currentEnd);
	}

	// アイテム全体のキーダウンイベントハンドラ

	function finishEditing() {
		editorOverlayStore.stopCursorBlink();

		// カーソルのみクリアし、跨いだ選択は残す
		editorOverlayStore.clearCursorForItem(model.id);
		editorOverlayStore.setActiveItem(null);
	}

        function addNewItem() {
                if (isReadOnly) return;
                let target = item.aliasId ? getAliasTarget(item.aliasId) : model.original;
                if (target && target.items && Tree.is(target.items, Items)) {
                        target.items.addNode(currentUser,0);
                }
        }

        function handleDelete() {
                if (isReadOnly) return;
                if (confirm('このアイテムを削除しますか？')) {
                        const target = item.aliasId ? getAliasTarget(item.aliasId) : model.original;
                        target?.delete();
                }
        }

        function toggleVote() {
                if (!isReadOnly) {
                        const target = item.aliasId ? getAliasTarget(item.aliasId) : model.original;
                        target?.toggleVote(currentUser);
                }
        }

	/**
	 * クリック時のハンドリング: Alt+Click でマルチカーソル追加、それ以外は編集開始
	 * @param event マウスイベント
	 */
	function handleClick(event: MouseEvent) {
		// Alt+Click: 新しいカーソルを追加
		if (event.altKey) {
			// イベントの伝播を確実に停止
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();

			// クリック位置を取得
			const pos = getClickPosition(event, text.current);

			// デバッグ情報
			if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
				console.log(`Alt+Click on item ${model.id} at position ${pos}`);
				// 現在のカーソル状態をログ
				const cursorInstances = editorOverlayStore.getCursorInstances();
				const cursors = Object.values(editorOverlayStore.cursors);
				console.log(`Current cursor instances: ${cursorInstances.length}`);
				console.log(`Current cursors in store: ${cursors.length}`);
				console.log(`Active item ID: ${editorOverlayStore.getActiveItem()}`);
			}

			// 新しいカーソルを追加（既存のカーソルチェックはaddCursor内で行う）
			const cursorId = editorOverlayStore.addCursor({
				itemId: model.id,
				offset: pos,
				isActive: true,
				userId: 'local'
			});

			// デバッグ情報
			if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
				console.log(`Added new cursor with ID ${cursorId} at position ${pos}`);
			}

			// アクティブアイテムを設定
			editorOverlayStore.setActiveItem(model.id);

			// グローバルテキストエリアにフォーカス（より確実な方法）
			const textarea = editorOverlayStore.getTextareaRef();
			if (textarea) {
				// フォーカスを確実に設定するための複数の試行
				textarea.focus();

				// requestAnimationFrameを使用してフォーカスを設定
				requestAnimationFrame(() => {
					textarea.focus();

					// さらに確実にするためにsetTimeoutも併用
					setTimeout(() => {
						textarea.focus();

						// フォーカスが設定されたかチェック
						if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
							console.log(`Textarea has focus: ${document.activeElement === textarea}`);
						}
					}, 10);
				});
			} else {
				console.error('Global textarea not found');
			}

			// カーソル点滅を開始
			editorOverlayStore.startCursorBlink();
			return;
		}

		// 通常クリック: 編集開始
		event.preventDefault();
		event.stopPropagation();

		// 編集開始（内部でカーソルクリアと設定を行う）
		startEditing(event);
	}

	/**
	 * マウスダウン時のハンドリング: ドラッグ開始
	 * @param event マウスイベント
	 */
	function handleMouseDown(event: MouseEvent) {
		// 右クリックは無視
		if (event.button !== 0) return;

		// Shift+クリックの場合は選択範囲を拡張
		if (event.shiftKey) {
			event.preventDefault();
			event.stopPropagation();

			// 現在のアクティブアイテムを取得
			const activeItemId = editorOverlayStore.getActiveItem();
			if (!activeItemId) {
				// アクティブアイテムがない場合は通常のクリック処理
				startEditing(event);
				return;
			}

			// 現在の選択範囲を取得
			const existingSelection = Object.values(editorOverlayStore.selections).find(s =>
				s.userId === 'local'
			);

			if (!existingSelection) {
				// 選択範囲がない場合は通常のクリック処理
				startEditing(event);
				return;
			}

			// クリック位置を取得
			const clickPosition = getClickPosition(event, text.current);

			// 選択範囲を拡張
			const isReversed = activeItemId === model.id ?
				clickPosition < existingSelection.startOffset :
				false;

			editorOverlayStore.setSelection({
				startItemId: existingSelection.startItemId,
				startOffset: existingSelection.startOffset,
				endItemId: model.id,
				endOffset: clickPosition,
				userId: 'local',
				isReversed: isReversed
			});

			// カーソル位置を更新
			editorOverlayStore.setCursor({
				itemId: model.id,
				offset: clickPosition,
				isActive: true,
				userId: 'local'
			});

			// アクティブアイテムを設定
			editorOverlayStore.setActiveItem(model.id);

			// カーソル点滅を開始
			editorOverlayStore.startCursorBlink();

			return;
		}

		// 通常のマウスダウン: ドラッグ開始準備
		const clickPosition = getClickPosition(event, text.current);
		dragStartPosition = clickPosition;

		// 編集モードを開始
		if (!hasCursorBasedOnState()) {
			startEditing(event);
		}

		// ドラッグ開始イベントを発火
		dispatch('drag-start', {
			itemId: model.id,
			offset: clickPosition
		});
	}

	/**
	 * マウスムーブ時のハンドリング: ドラッグ中の選択範囲更新
	 * @param event マウスイベント
	 */
	function handleMouseMove(event: MouseEvent) {
		// 左ボタンが押されていない場合は無視
		if (event.buttons !== 1) return;

		// 編集中でない場合は無視
		if (!hasCursorBasedOnState()) return;

		// ドラッグ中フラグを設定
		isDragging = true;

		// 現在のマウス位置を取得
		const currentPosition = getClickPosition(event, text.current);

		// Alt+Shift+ドラッグの場合は矩形選択（ボックス選択）
		if (event.altKey && event.shiftKey) {
			// 矩形選択の処理
			handleBoxSelection(event, currentPosition);
			return;
		}

		// 通常の選択範囲を更新
		if (hiddenTextareaRef) {
			const start = Math.min(dragStartPosition, currentPosition);
			const end = Math.max(dragStartPosition, currentPosition);
			const isReversed = currentPosition < dragStartPosition;

			// テキストエリアの選択範囲を設定
			hiddenTextareaRef.setSelectionRange(
				start,
				end,
				isReversed ? 'backward' : 'forward'
			);

			// 選択範囲をストアに反映
			editorOverlayStore.setSelection({
				startItemId: model.id,
				startOffset: start,
				endItemId: model.id,
				endOffset: end,
				userId: 'local',
				isReversed: isReversed
			});

			// カーソル位置を更新
			editorOverlayStore.setCursor({
				itemId: model.id,
				offset: isReversed ? start : end,
				isActive: true,
				userId: 'local'
			});

			// ドラッグイベントを発火
			dispatch('drag', {
				itemId: model.id,
				offset: currentPosition
			});
		}
	}

	/**
	 * 矩形選択（ボックス選択）の処理
	 * @param event マウスイベント
	 * @param currentPosition 現在のカーソル位置
	 */
	function handleBoxSelection(event: MouseEvent, currentPosition: number) {
		// デバッグ情報
		if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
			console.log(`handleBoxSelection called with currentPosition=${currentPosition}`);
		}

		// 矩形選択の開始位置と終了位置
		const startX = Math.min(dragStartPosition, currentPosition);
		const endX = Math.max(dragStartPosition, currentPosition);

		// ドラッグの開始位置と現在位置のY座標
		const dragStartY = event.clientY - event.movementY; // 前回のY座標
		const currentY = event.clientY;

		// 選択範囲のY座標の上限と下限
		const topY = Math.min(dragStartY, currentY);
		const bottomY = Math.max(dragStartY, currentY);

		// 表示されているすべてのアイテムを取得
		const allItems = Array.from(document.querySelectorAll('.outliner-item'));

		// 矩形選択の範囲内にあるアイテムを特定
		const itemsInRange: Array<{
			itemId: string;
			element: HTMLElement;
			rect: DOMRect;
		}> = [];

		// 各アイテムについて、矩形選択の範囲内かどうかを判定
		allItems.forEach(itemElement => {
			const itemId = itemElement.getAttribute('data-item-id');
			if (!itemId) return;

			const rect = itemElement.getBoundingClientRect();

			// アイテムが矩形選択の範囲内にあるかどうかを判定
			// 現在のアイテムは常に含める
			if (itemId === model.id || (rect.bottom >= topY && rect.top <= bottomY)) {
				itemsInRange.push({
					itemId,
					element: itemElement as HTMLElement,
					rect
				});
			}
		});

		// 矩形選択の範囲内にあるアイテムがない場合は何もしない
		if (itemsInRange.length === 0) return;

		// Y座標でソート
		itemsInRange.sort((a, b) => a.rect.top - b.rect.top);

		// 各アイテムの選択範囲を計算
		const boxSelectionRanges: Array<{
			itemId: string;
			startOffset: number;
			endOffset: number;
		}> = [];

		// 各アイテムについて、選択範囲を計算
		itemsInRange.forEach(item => {
			const textElement = item.element.querySelector('.item-text') as HTMLElement;
			if (!textElement) return;

			const textContent = textElement.textContent || '';

			// 選択範囲の開始位置と終了位置を計算
			// 各アイテムの文字位置を計算するためのより正確な方法
			let itemStartOffset = startX;
			let itemEndOffset = endX;

			// テキスト内容に基づいて位置を調整
			// 文字単位での位置計算を行う
			if (item.itemId === model.id) {
				// 現在のアイテムの場合は、ドラッグ開始位置と現在位置を使用
				itemStartOffset = startX;
				itemEndOffset = endX;
			} else {
				// 他のアイテムの場合は、テキスト内容に基づいて位置を計算
				// 仮想的なクリックイベントを作成して位置を計算
				const virtualEvent = new MouseEvent('click', {
					clientX: event.clientX,
					clientY: item.rect.top + (item.rect.height / 2) // アイテムの中央
				});

				// 水平方向の位置を計算
				const rect = textElement.getBoundingClientRect();
				const relX = event.clientX - rect.left;

				// 文字単位での位置を計算
				const span = document.createElement('span');
				const style = window.getComputedStyle(textElement);
				span.style.fontFamily = style.fontFamily;
				span.style.fontSize = style.fontSize;
				span.style.fontWeight = style.fontWeight;
				span.style.letterSpacing = style.letterSpacing;
				span.style.whiteSpace = 'pre';
				span.style.visibility = 'hidden';
				span.style.position = 'absolute';
				document.body.appendChild(span);

				// 開始位置を計算
				let startPos = 0;
				let minStartDist = Infinity;
				for (let i = 0; i <= textContent.length; i++) {
					span.textContent = textContent.slice(0, i);
					const w = span.getBoundingClientRect().width;
					const d = Math.abs(w - (relX - (endX - startX)));
					if (d < minStartDist) {
						minStartDist = d;
						startPos = i;
					}
				}

				// 終了位置を計算
				let endPos = 0;
				let minEndDist = Infinity;
				for (let i = 0; i <= textContent.length; i++) {
					span.textContent = textContent.slice(0, i);
					const w = span.getBoundingClientRect().width;
					const d = Math.abs(w - relX);
					if (d < minEndDist) {
						minEndDist = d;
						endPos = i;
					}
				}

				document.body.removeChild(span);

				// 計算した位置を使用
				itemStartOffset = Math.min(startPos, endPos);
				itemEndOffset = Math.max(startPos, endPos);
			}

			// 範囲外の場合は修正
			if (itemStartOffset < 0) itemStartOffset = 0;
			if (itemEndOffset > textContent.length) itemEndOffset = textContent.length;

			// 選択範囲が有効な場合のみ追加
			if (itemStartOffset < itemEndOffset) {
				boxSelectionRanges.push({
					itemId: item.itemId,
					startOffset: itemStartOffset,
					endOffset: itemEndOffset
				});
			}
		});

		// 矩形選択を設定
		if (boxSelectionRanges.length > 0) {
			// 最初と最後のアイテムを取得
			const firstItem = boxSelectionRanges[0];
			const lastItem = boxSelectionRanges[boxSelectionRanges.length - 1];

			// 矩形選択を設定
			editorOverlayStore.setBoxSelection(
				firstItem.itemId,
				firstItem.startOffset,
				lastItem.itemId,
				lastItem.endOffset,
				boxSelectionRanges,
				'local'
			);

			// カーソル位置を更新
			editorOverlayStore.setCursor({
				itemId: model.id,
				offset: currentPosition,
				isActive: true,
				userId: 'local'
			});

			// ドラッグイベントを発火
			dispatch('box-selection', {
				startItemId: firstItem.itemId,
				endItemId: lastItem.itemId,
				ranges: boxSelectionRanges
			});
		}
	}

	/**
	 * マウスアップ時のハンドリング: ドラッグ終了
	 */
	function handleMouseUp() {
		// ドラッグ中でない場合は無視
		if (!isDragging) return;

		// ドラッグ終了
		isDragging = false;

		// 選択範囲を確定
		updateSelectionAndCursor();

		// カーソル点滅を開始
		editorOverlayStore.startCursorBlink();

		// ドラッグ終了イベントを発火
		dispatch('drag-end', {
			itemId: model.id,
			offset: lastCursorPosition
		});
	}

	/**
	 * ドラッグ開始時のハンドリング
	 * @param event ドラッグイベント
	 */
	function handleDragStart(event: DragEvent) {
		// 選択範囲がある場合は選択範囲をドラッグ
		const selection = Object.values(editorOverlayStore.selections).find(s =>
			s.userId === 'local' && (s.startItemId === model.id || s.endItemId === model.id)
		);

		if (selection) {
			// 選択範囲のテキストを取得
			const selectedText = editorOverlayStore.getSelectedText('local');

			// ドラッグデータを設定
			if (event.dataTransfer) {
				event.dataTransfer.setData('text/plain', selectedText);
				event.dataTransfer.setData('application/x-outliner-selection', JSON.stringify(selection));
				event.dataTransfer.effectAllowed = 'move';
			}

			// ドラッグ中フラグを設定
			isDragging = true;
			isDragSelectionMode = true;
		} else {
			// 単一アイテムのテキストをドラッグ
			if (event.dataTransfer) {
				event.dataTransfer.setData('text/plain', text.current);
				event.dataTransfer.setData('application/x-outliner-item', model.id);
				event.dataTransfer.effectAllowed = 'move';
			}

			// ドラッグ中フラグを設定
			isDragging = true;
			isDragSelectionMode = false;
		}

		// ドラッグ開始イベントを発火
		dispatch('drag-start', {
			itemId: model.id,
			selection: selection || null
		});
	}

	/**
	 * ドラッグオーバー時のハンドリング
	 * @param event ドラッグイベント
	 */
	function handleDragOver(event: DragEvent) {
		// デフォルト動作を防止（ドロップを許可）
		event.preventDefault();

		// ドロップ効果を設定
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}

		// ドロップターゲットの位置を計算
		const rect = displayRef.getBoundingClientRect();
		const y = event.clientY;
		const relativeY = y - rect.top;
		const height = rect.height;

		// 上部、中央、下部のどこにドロップするかを決定
		if (relativeY < height * 0.3) {
			dropTargetPosition = 'top';
		} else if (relativeY > height * 0.7) {
			dropTargetPosition = 'bottom';
		} else {
			dropTargetPosition = 'middle';
		}

		// ドロップターゲットフラグを設定
		isDropTarget = true;
	}

	/**
	 * ドラッグエンター時のハンドリング
	 * @param event ドラッグイベント
	 */
	function handleDragEnter(event: DragEvent) {
		// デフォルト動作を防止
		event.preventDefault();

		// ドロップターゲットフラグを設定
		isDropTarget = true;
	}

	/**
	 * ドラッグリーブ時のハンドリング
	 */
	function handleDragLeave() {
		// ドロップターゲットフラグをクリア
		isDropTarget = false;
		dropTargetPosition = null;
	}

	/**
	 * ドロップ時のハンドリング
	 * @param event ドラッグイベント
	 */
	function handleDrop(event: DragEvent) {
		// デフォルト動作を防止
		event.preventDefault();

		// ドロップターゲットフラグをクリア
		isDropTarget = false;

		// ドロップデータを取得
		if (!event.dataTransfer) return;

		const plainText = event.dataTransfer.getData('text/plain');
		const selectionData = event.dataTransfer.getData('application/x-outliner-selection');
		const itemId = event.dataTransfer.getData('application/x-outliner-item');

		// ドロップイベントを発火
		dispatch('drop', {
			targetItemId: model.id,
			position: dropTargetPosition,
			text: plainText,
			selection: selectionData ? JSON.parse(selectionData) : null,
			sourceItemId: itemId || null
		});

		// ドロップ位置をクリア
		dropTargetPosition = null;
	}

	/**
	 * ドラッグ終了時のハンドリング
	 */
	function handleDragEnd() {
		// ドラッグ中フラグをクリア
		isDragging = false;
		isDragSelectionMode = false;

		// ドラッグ終了イベントを発火
		dispatch('drag-end', {
			itemId: model.id
		});
	}

	// 内部リンクのクリックイベントハンドラは削除
	// SvelteKitのルーティングを使用して内部リンクを処理

	onMount(() => {
		// テキストエリアがレンダリングされているか確認
		if (!hiddenTextareaRef) {
			console.error('Hidden textarea reference is not available');
			return;
		}

		// 内部リンクのクリックイベントリスナーは削除
		// SvelteKitのルーティングを使用して内部リンクを処理

		// クリック外のイベントリスナー
		const handleOutsideClick = (e: MouseEvent) => {
			if (hasCursorBasedOnState() && displayRef && !displayRef.contains(e.target as Node)) {
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
			if (hasCursorBasedOnState()) {
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log(`Item ${model.id} is already in edit mode`);
				}
				return;
			}

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
			if (hasCursorBasedOnState()) {
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
		if (!hiddenTextareaRef || !hasCursorBasedOnState()) return;

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
	onmousedown={handleMouseDown}
	onmousemove={handleMouseMove}
	onmouseup={handleMouseUp}
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
				class:dragging={isDragging}
				class:drop-target={isDropTarget}
				class:drop-target-top={isDropTarget && dropTargetPosition === 'top'}
				class:drop-target-bottom={isDropTarget && dropTargetPosition === 'bottom'}
				class:drop-target-middle={isDropTarget && dropTargetPosition === 'middle'}
				draggable={!isReadOnly}
				ondragstart={handleDragStart}
				ondragover={handleDragOver}
				ondragenter={handleDragEnter}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				ondragend={handleDragEnd}
			>
				{#if hasActiveCursor()}
					<!-- フォーカスがある場合：フォーマットを適用した上で制御文字を表示 -->
					<span class="item-text" class:title-text={isPageTitle} class:formatted={ScrapboxFormatter.hasFormatting(text.current)}>
						{@html ScrapboxFormatter.formatWithControlChars(text.current)}
					</span>
				{:else}
					<!-- フォーカスがない場合：制御文字は非表示、フォーマットは適用 -->
					<span class="item-text" class:title-text={isPageTitle} class:formatted={ScrapboxFormatter.hasFormatting(text.current)}>
						{@html ScrapboxFormatter.formatToHtml(text.current)}
					</span>
				{/if}
				{#if item.aliasId && aliasPath}
					<a class="alias-path" href={aliasUrl}>{aliasPath}</a>
				{/if}
				{#if !isPageTitle && model.votes.length > 0}
					<span class="vote-count">{model.votes.length}</span>
				{/if}
			</div>

			{#if model.embed?.type === 'table'}
				<TableEmbed query={model.embed.query} />
			{:else if model.embed?.type === 'chart'}
				<ChartEmbed option={model.embed.option} />
			{/if}
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

	/* 編集中のスタイルは削除 */

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

	/* フォーマットされたテキストのスタイル */
	.item-text.formatted strong {
		font-weight: bold;
	}

	.item-text.formatted em {
		font-style: italic;
	}

	.item-text.formatted s {
		text-decoration: line-through;
	}

	.item-text.formatted code {
		font-family: monospace;
		background-color: #f5f5f5;
		padding: 0 4px;
		border-radius: 3px;
	}

	/* リンクのスタイル */
	.item-text.formatted a {
		color: #0078d7;
		text-decoration: none;
	}

        .item-text.formatted a:hover {
                text-decoration: underline;
        }

        .alias-path {
                font-size: 0.8em;
                color: #888;
                margin-left: 4px;
        }



	/* 引用のスタイル */
	.item-text.formatted blockquote {
		margin: 0;
		padding-left: 10px;
		border-left: 3px solid #ccc;
		color: #666;
		font-style: italic;
	}

	/* 制御文字のスタイル */
	:global(.control-char) {
		color: #aaa;
		font-size: 0.9em;
		opacity: 0.7;
		background-color: #f8f8f8;
		border-radius: 2px;
		padding: 0 2px;
	}

	/* ドラッグ＆ドロップ関連のスタイル */
	.item-content.dragging {
		opacity: 0.7;
		cursor: grabbing;
	}

	.item-content.drop-target {
		position: relative;
	}

	.item-content.drop-target::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background-color: #0078d7;
		z-index: 10;
	}

	.item-content.drop-target-top::before {
		top: 0;
	}

	.item-content.drop-target-bottom::before {
		bottom: 0;
	}

	.item-content.drop-target-middle::after {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2px;
		background-color: #0078d7;
		z-index: 10;
	}
</style>