<script lang="ts">
	import { Tree } from 'fluid-framework';
	import { createEventDispatcher, onMount } from 'svelte';
	import { getLogger } from '../lib/logger';
	import { Items } from '../schema/app-schema';
	import {
		addCursor,
		clearCursorAndSelection,
		clearCursorForItem,
		getItemCursorsAndSelections,
		setActiveItem,
		setCursor,
		setSelection,
		startCursorBlink,
		stopCursorBlink,
		updateCursor
	} from '../stores/EditorOverlayStore';
	import type { OutlinerItemViewModel } from '../stores/OutlinerViewModel';
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
		index: number; // 追加：アイテムのインデックス
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
	let lastHeight = 0;

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

	function startEditing(event?: MouseEvent, initialCursorPosition?: number) {
		if (isReadOnly) return;
		isEditing = true;
		
		// テキストエリアの内容を同期
		hiddenTextareaRef.value = text.current;
		hiddenTextareaRef.focus();
		
		let cursorPosition = initialCursorPosition;
		
		if (event) {
			// クリック位置に基づいてカーソル位置を設定
			cursorPosition = getClickPosition(event, text.current);
		} else if (initialCursorPosition === undefined) {
			// デフォルトでは末尾にカーソルを配置（外部から指定がない場合のみ）
			cursorPosition = text.current.length;
		}
		
		if (cursorPosition !== undefined) {
			hiddenTextareaRef.setSelectionRange(cursorPosition, cursorPosition);
			selectionStart = selectionEnd = cursorPosition;
		}
		
		// カーソル位置をストアに設定
		setActiveItem(model.id);
		setCursor({
			itemId: model.id,
			offset: cursorPosition !== undefined ? cursorPosition : 0,
			isActive: true,
			userId: 'local'
		});
		
		// カーソル点滅を開始
		startCursorBlink();
	}

	/**
	 * テキスト内の指定された位置にあるキャレットの画面座標を計算します
	 */
	function getCaretScreenCoordinates(element: HTMLElement, position: number): { top: number, left: number } {
		try {
			// テキストノードを見つける
			const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
			
			if (!textNode) {
				// テキストノードが見つからない場合は要素の左上の座標を返す
				const rect = element.getBoundingClientRect();
				return { top: rect.top, left: rect.left };
			}
			
			// 指定された位置にレンジをセット
			const range = document.createRange();
			range.setStart(textNode, Math.min(position, textNode.textContent?.length || 0));
			range.setEnd(textNode, Math.min(position, textNode.textContent?.length || 0));
			
			// レンジの境界矩形を取得
			const rect = range.getBoundingClientRect();
			return { top: rect.top, left: rect.left };
		} catch (error) {
			console.error('Error calculating caret position:', error);
			// エラーが発生した場合は要素の左上の座標を返す
			const rect = element.getBoundingClientRect();
			return { top: rect.top, left: rect.left };
		}
	}

	// テキストエリア用のキーダウンハンドラ
	function handleKeyDown(event: KeyboardEvent) {
		if (!isEditing) return;
		
		if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
			console.log(`KeyDown in item: ${model.id}, key: ${event.key}, shift: ${event.shiftKey}`);
		}

		// カーソル位置と選択範囲を保存
		const currentSelectionStart = hiddenTextareaRef.selectionStart || 0;
		const currentSelectionEnd = hiddenTextareaRef.selectionEnd || 0;
		const currentSelectionDirection = hiddenTextareaRef.selectionDirection;
		
		lastSelectionStart = currentSelectionStart;
		lastSelectionEnd = currentSelectionEnd;
		lastCursorPosition = currentSelectionDirection === 'forward' ? 
			currentSelectionEnd : currentSelectionStart;

		// アイテム間移動用のカスタムイベントを発火
		if (event.key === 'ArrowUp' && isAtFirstLine()) {
			event.preventDefault();
			event.stopPropagation();
			const cursorScreenX = calculateCursorScreenPosition(currentSelectionStart);
			dispatch('navigate-to-item', {
				direction: 'up',
				itemId: model.id,
				cursorScreenX,
				fromItemId: model.id,
				shiftKey: event.shiftKey
			});
			return;
		}
		if (event.key === 'ArrowDown' && isAtLastLine()) {
			event.preventDefault();
			event.stopPropagation();
			const cursorScreenX = calculateCursorScreenPosition(currentSelectionStart);
			dispatch('navigate-to-item', {
				direction: 'down',
				itemId: model.id,
				cursorScreenX,
				fromItemId: model.id,
				shiftKey: event.shiftKey
			});
			return;
		}

		// 矢印キー処理
		if (event.key === 'ArrowLeft') {
			if (currentSelectionStart === 0 && currentSelectionEnd === 0) {
				// テキストの先頭にいる場合は左のアイテムに移動
				event.preventDefault();
				event.stopPropagation();
				
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log(`Left navigation from text start`);
				}
				
				// 左のアイテムの末尾に移動するための特殊な値
				const targetScreenX = Number.MAX_SAFE_INTEGER;
				
				finishEditing();
				dispatch('navigate-to-item', { 
					direction: 'left', 
					itemId: model.id,
					cursorScreenX: targetScreenX,
					fromItemId: model.id 
				});
				return;
			}
		} else if (event.key === 'ArrowRight') {
			if (currentSelectionStart === hiddenTextareaRef.value.length && 
				currentSelectionEnd === hiddenTextareaRef.value.length) {
				// テキストの末尾にいる場合は右のアイテムに移動
				event.preventDefault();
				event.stopPropagation();
				
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log(`Right navigation from text end`);
				}
				
				// 右のアイテムの先頭に移動するための特殊な値
				const targetScreenX = 0;
				
				finishEditing();
				dispatch('navigate-to-item', { 
					direction: 'right', 
					itemId: model.id,
					cursorScreenX: targetScreenX,
					fromItemId: model.id 
				});
				return;
			}
		} else if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			
			if (isPageTitle) {
				// ページタイトルの場合、子アイテムとして追加
				finishEditing();
				addNewItem();
			} else {
				// 通常アイテムの場合、同じ階層に新しいアイテムを追加
				finishEditing();
				dispatch('add-sibling', { itemId: model.id });
			}
			return;
		} else if (event.key === 'Escape') {
			// Escape処理
			event.preventDefault();
			finishEditing();
			return;
		} else if (event.key === 'Tab') {
			// Tab処理
			event.preventDefault();
			event.stopPropagation();

			if (event.shiftKey) {
				dispatch('unindent', { itemId: model.id });
			} else {
				dispatch('indent', { itemId: model.id });
			}

			logger.info('Tab key processed in textarea');
			return;
		}
		
		// 矢印キー処理後のカーソル位置更新
		if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
			startCursorBlink();
			requestAnimationFrame(() => {
				if (!event.defaultPrevented) {
					updateSelectionAndCursor(event.shiftKey);
				}
			});
		}
	}

	// カーソルのスクリーン座標を計算する関数
	function calculateCursorScreenPosition(cursorPos: number): number | null {
		if (!displayRef) return null;
		
		const textElement = displayRef.querySelector('.item-text') as HTMLElement;
		if (!textElement) return null;
		
		const currentText = text.current || '';
		if (cursorPos < 0 || cursorPos > currentText.length) return null;
		
		try {
			// 指定位置にレンジを作成
			const textNode = Array.from(textElement.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
			
			if (textNode && textNode.textContent === currentText) {
				// テキストノードが見つかり、内容が一致する場合は直接レンジを使用
				const range = document.createRange();
				range.setStart(textNode, Math.min(cursorPos, textNode.textContent.length));
				range.setEnd(textNode, Math.min(cursorPos, textNode.textContent.length));
				const rect = range.getBoundingClientRect();
				
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log(`Cursor position calculation using range: pos=${cursorPos}, x=${rect.left}`);
				}
				
				return rect.left;
			} else {
				// レンジが使えない場合はspan要素を使った測定
				const span = document.createElement('span');
				span.style.font = window.getComputedStyle(textElement).font;
				span.style.whiteSpace = 'pre';
				span.style.visibility = 'hidden';
				span.style.position = 'absolute';
				document.body.appendChild(span);
				
				// カーソル位置までのテキストを計測
				const textBeforeCursor = currentText.substring(0, cursorPos);
				span.textContent = textBeforeCursor;
				const textWidth = span.getBoundingClientRect().width;
				
				// テキスト要素の位置を取得
				const textRect = textElement.getBoundingClientRect();
				
				// 絶対X座標を計算
				const screenX = textRect.left + textWidth;
				
				// 片付け
				document.body.removeChild(span);
				
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log('Cursor screen position calculation using span:', {
						textBeforeCursor,
						textWidth,
						textRectLeft: textRect.left,
						screenX
					});
				}
				
				return screenX;
			}
		} catch (error) {
			console.error('Error calculating cursor position:', error);
			return null;
		}
	}

	// テキストの最初の行にカーソルがあるか確認
	function isAtFirstLine(): boolean {
		const text = hiddenTextareaRef.value;
		const position = hiddenTextareaRef.selectionStart || 0;
		
		// 位置が0なら確実に最初の行
		if (position === 0) return true;
		
		// 位置までにある改行を数える
		const textBeforeCursor = text.substring(0, position);
		const hasNewLine = textBeforeCursor.includes('\n');
		
		return !hasNewLine; // 改行が無ければ最初の行
	}

	// テキストの最後の行にカーソルがあるか確認
	function isAtLastLine(): boolean {
		const text = hiddenTextareaRef.value;
		const position = hiddenTextareaRef.selectionStart || 0;
		
		// 位置が末尾なら確実に最後の行
		if (position === text.length) return true;
		
		// カーソル位置以降にある改行を数える
		const textAfterCursor = text.substring(position);
		const hasNewLine = textAfterCursor.includes('\n');
		
		return !hasNewLine; // 改行が無ければ最後の行
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
			
			setCursor({
				itemId: model.id,
				offset: currentStart,
				isActive: true,
				userId: 'local'
			});
			setSelection({
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
			
			setCursor({
				itemId: model.id,
				offset: cursorOffset,
				isActive: true,
				userId: 'local'
			});
			setSelection({
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

	// 隠し textarea からの入力を受け、マルチカーソル対応の insertText を適用する
	function handleInput(event: any) {
		const ev = event as InputEvent;
		// insertText のみ多重挿入
		if (ev.inputType === 'insertText' && ev.data) {
			const ch = ev.data;
			// このアイテムに紐づく全カーソル位置を取得
			const cursors = getItemCursorsAndSelections(model.id).cursors;
			// 後ろのオフセットから順に処理しないとズレるので降順ソート
			cursors.sort((a, b) => b.offset - a.offset);

			// SharedTree と text.current を immutably 更新
			let newText = text.current;
			cursors.forEach(c => {
				newText = newText.slice(0, c.offset) + ch + newText.slice(c.offset);
			});
			text.current = newText;

			// 各カーソル位置を挿入後の位置に更新
			cursors.forEach(c => {
				updateCursor({
					...c,
					offset: c.offset + ch.length,
					isActive: true
				});
			});

			// 隠し textarea の値も最新化
			hiddenTextareaRef.value = newText;
			// カーソル点滅
			startCursorBlink();
		} else {
			// 通常入力は従来通り
			text.current = hiddenTextareaRef.value;
			requestAnimationFrame(() => {
				updateSelectionAndCursor();
			});
		}
	}

	function finishEditing() {
		isEditing = false;
		stopCursorBlink();
		
		// カーソルのみクリアし、跨いだ選択は残す
		clearCursorForItem(model.id);
		setActiveItem(null);
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
			// クリック位置に基づいてオフセット計算
			const pos = getClickPosition(event, text.current);
			addCursor({
				itemId: model.id,
				offset: pos,
				isActive: true,
				userId: 'local'
			});
			return;
		}
		// 通常クリック: 編集開始
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
			
			// 一連の処理をリクエストアニメーションフレームで最適化
			requestAnimationFrame(() => {
				try {
					// まずフォーカスを設定（最優先）
					hiddenTextareaRef.focus();
					
					// ローカル変数を更新 (shiftKey時はクロスアイテム選択拡張)
					if (!shiftKey) {
						selectionStart = selectionEnd = textPosition;
						lastSelectionStart = lastSelectionEnd = textPosition;
						lastCursorPosition = textPosition;
					} else if (direction === 'down' || direction === 'right') {
						// 次アイテム: 行頭からカーソル位置まで選択
						selectionStart = 0;
						selectionEnd = textPosition;
						lastSelectionStart = 0;
						lastSelectionEnd = textPosition;
						lastCursorPosition = textPosition;
					} else if (direction === 'up' || direction === 'left') {
						// 前アイテム: カーソル位置から行末まで選択
						selectionStart = textPosition;
						selectionEnd = hiddenTextareaRef.value.length;
						lastSelectionStart = textPosition;
						lastSelectionEnd = hiddenTextareaRef.value.length;
						lastCursorPosition = textPosition;
					}
					
					// 再度カーソルが表示されていることを確認
					startCursorBlink();
					
					// editorOverlayStoreにアクティブアイテムとカーソル位置を設定（選択範囲はOutlinerTree側で管理）
					setCursor({
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
			
			clearCursorAndSelection();
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
			selectionStart = selectionEnd = safePosition;
			lastSelectionStart = lastSelectionEnd = safePosition;
			lastCursorPosition = safePosition;
			
			// ストアにカーソル位置を設定
			setCursor({
				itemId: model.id,
				offset: safePosition,
				isActive: true,
				userId: 'local'
			});
			
			// 選択範囲をクリア
			setSelection({
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
		selectionStart = start;
		selectionEnd = end;
		lastSelectionStart = start;
		lastSelectionEnd = end;
		lastCursorPosition = end;
		
		updateSelectionAndCursor();
		startCursorBlink();
	}

	// アイテムの編集を開始し、カーソル位置を指定する
	export function startEditingWithPosition(position: 'start' | 'end' | number = 'end') {
		if (isReadOnly || isEditing) return;
		
		isEditing = true;
		hiddenTextareaRef.value = text.current;
		hiddenTextareaRef.focus();
		
		let cursorPosition: number;
		
		if (position === 'start') {
			cursorPosition = 0;
		} else if (position === 'end') {
			cursorPosition = text.current.length;
		} else if (typeof position === 'number') {
			// 0～1の相対位置が指定された場合
			if (position >= 0 && position <= 1) {
				cursorPosition = Math.round(text.current.length * position);
			} else {
				// 絶対位置が指定された場合
				cursorPosition = Math.min(Math.max(0, position), text.current.length);
			}
		} else {
			cursorPosition = text.current.length;
		}
		
		setSelectionPosition(cursorPosition);
		
		setCursor({
			itemId: model.id,
			offset: cursorPosition,
			isActive: true,
			userId: 'local'
		});
		
		// 重要: カーソル点滅を開始
		startCursorBlink();
	}

	// 他のアイテムに移動するイベントを発火する
	function navigateToItem(direction: "up" | "down" | "left" | "right") {
		// カーソル位置のスクリーンX座標を計算
		let cursorScreenX: number | undefined = undefined;
		
		if (isEditing && hiddenTextareaRef && document.activeElement === hiddenTextareaRef) {
			const cursorPosition = hiddenTextareaRef.selectionStart || 0;
			
			// カーソル位置のスクリーン座標を計算
			const pos = calculateCursorScreenPosition(cursorPosition);
			if (pos !== null) {
				cursorScreenX = pos;
				
				if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
					console.log(`Navigate ${direction}: cursor position=${cursorPosition}, screenX=${cursorScreenX}`);
				}
			}
		}
		
		dispatch("navigate-to-item", {
			direction,
			itemId: model.id,
			cursorScreenX,
			fromItemId: model.id
		});
	}

	function navigate(event: KeyboardEvent, direction: 'up' | 'down') {
		if (isEditing) {
			event.preventDefault();
			
			if (!hiddenTextareaRef) return;
			
			const cursorPosition = hiddenTextareaRef.selectionStart || 0;
			
			// カーソル位置のスクリーン座標を計算
			const cursorScreenX = calculateCursorScreenPosition(cursorPosition);
			
			if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
				console.log(`Navigate ${direction}: cursor position=${cursorPosition}, screenX=${cursorScreenX}`);
			}
			
			// 編集を終了
			finishEditing();
			
			// ナビゲーションイベントを発行
			dispatch('navigate-to-item', {
				direction,
				cursorScreenX,
				fromItemId: model.id
			});
		}
	}

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

<div
	class="outliner-item"
	class:page-title={isPageTitle}
	style="margin-left: {depth * 20}px"
	tabindex="0"
	on:click={handleClick}
	on:keydown={handleItemKeyDown}
	bind:this={itemRef}
	data-item-id={model.id}
>
	<div class="item-header">
		{#if !isPageTitle}
			{#if hasChildren}
				<button class="collapse-btn" on:click={toggleCollapse}>
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
				on:keydown={handleKeyDown}
				on:input={handleInput}
				on:blur={finishEditing}
			></textarea>
			
			<!-- 表示用の要素 -->
			<div
				bind:this={displayRef}
				class="item-content"
				class:page-title-content={isPageTitle}
				on:click={handleClick}
				class:editing={isEditing}
			>
				{#if text.current}
					<span class="item-text" class:title-text={isPageTitle}>{text.current}</span>
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
				<button on:click={addNewItem} title="新しいアイテムを追加">+</button>
				<button on:click={handleDelete} title="削除">×</button>
				<button
					on:click={toggleVote}
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