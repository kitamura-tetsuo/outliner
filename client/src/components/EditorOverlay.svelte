<script lang="ts">
import { createEventDispatcher, onDestroy, onMount } from 'svelte';
import type { CursorPosition, SelectionRange } from '../stores/EditorOverlayStore.svelte';
import { editorOverlayStore as store } from '../stores/EditorOverlayStore.svelte';

// store API (関数のみ)
const { stopCursorBlink } = store;

// デバッグモード
const DEBUG_MODE = false;
// 上位へイベント dispatch
const dispatch = createEventDispatcher();

// カーソルの位置とアイテムの位置情報をマッピングするオブジェクト
interface CursorPositionMap {
    [itemId: string]: {
        elementRect: DOMRect;
        textElement: HTMLElement;
        lineHeight: number;
        fontProperties: {
            fontFamily: string;
            fontSize: string;
            fontWeight: string;
            letterSpacing: string;
        };
    };
}

// カーソル位置・選択範囲などの状態をリアクティブに管理
let positionMap = $state<CursorPositionMap>({});
let allCursors = $state<CursorPosition[]>([]);
let allSelections = $state<SelectionRange[]>([]);
let clipboardRef: HTMLTextAreaElement;
let localActiveItemId = $state<string | null>(null);
let localCursorVisible = $state<boolean>(false);
let localAnimationPaused = $state<boolean>(false);

// DOM要素への参照
let overlayRef: HTMLDivElement;

// より正確なテキスト測定を行うヘルパー関数
function createMeasurementSpan(itemId: string, text: string): HTMLSpanElement {
    const itemInfo = positionMap[itemId];
    if (!itemInfo) {
        throw new Error(`Item info not found for ${itemId}`);
    }

    // 仮想測定用のspan要素を作成
    const span = document.createElement('span');

    // スタイルを正確に継承
    const { fontProperties } = itemInfo;
    span.style.fontFamily = fontProperties.fontFamily;
    span.style.fontSize = fontProperties.fontSize;
    span.style.fontWeight = fontProperties.fontWeight;
    span.style.letterSpacing = fontProperties.letterSpacing;

    // その他の重要なスタイル
    span.style.whiteSpace = 'pre';
    span.style.visibility = 'hidden';
    span.style.position = 'absolute';
    span.style.pointerEvents = 'none';
    span.textContent = text;

    return span;
}

// カーソル位置をピクセル値に変換する関数
function calculateCursorPixelPosition(itemId: string, offset: number): { left: number; top: number } | null {
    const itemInfo = positionMap[itemId];
    if (!itemInfo) {
        // アイテム情報がない場合は描画をスキップ
        return null;
    }
    const { textElement } = itemInfo;
    // ツリーコンテナを取得
    const treeContainer = overlayRef.closest('.tree-container');
    if (!treeContainer) return null;
    try {
        // 最新の位置情報を取得するため、常に新たに計測
        // テキスト要素の絶対位置
        const textRect = textElement.getBoundingClientRect();
        // ツリーコンテナの絶対位置
        const treeContainerRect = treeContainer.getBoundingClientRect();
        // テキストの内容を取得
        const text = textElement.textContent || '';
        // 空テキストの場合は必ず左端
        if (!text || text.length === 0) {
            const contentContainer = textElement.closest('.item-content-container');
            const contentRect = contentContainer?.getBoundingClientRect() || textRect;
            const contentLeft = contentRect.left - treeContainerRect.left;
            const relativeTop = textRect.top - treeContainerRect.top + 3;
            return { left: contentLeft, top: relativeTop };
        }
        // 折り返し対応: Range API を優先
        const textNode = Array.from(textElement.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined;
        if (textNode) {
            const range = document.createRange();
            const safeOffset = Math.min(offset, textNode.textContent?.length || 0);
            range.setStart(textNode, safeOffset);
            range.setEnd(textNode, safeOffset);
            const rects = range.getClientRects();
            const caretRect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
            const relativeLeft = caretRect.left - treeContainerRect.left;
            const relativeTop = caretRect.top - treeContainerRect.top;
            return { left: relativeLeft, top: relativeTop };
        }
        // フォールバック: 仮想spanで幅を測定
        const textBeforeCursor = text.substring(0, offset);
        const span = createMeasurementSpan(itemId, textBeforeCursor);
        textElement.parentElement?.appendChild(span);
        const cursorWidth = span.getBoundingClientRect().width;
        textElement.parentElement?.removeChild(span);
        const contentContainer = textElement.closest('.item-content-container');
        const contentRect = contentContainer?.getBoundingClientRect() || textRect;
        const contentLeft = contentRect.left - treeContainerRect.left;
        const relativeLeft = contentLeft + cursorWidth;
        const relativeTop = textRect.top - treeContainerRect.top + 3;
        if (DEBUG_MODE) {
            console.log(`Cursor for ${itemId} at offset ${offset}:`, { relativeLeft, relativeTop });
        }
        return { left: relativeLeft, top: relativeTop };
    } catch (error) {
        console.error('Error calculating cursor position:', error);
        return null;
    }
}

// 選択範囲のピクセル位置を計算する関数
function calculateSelectionPixelRange(
    itemId: string,
    startOffset: number,
    endOffset: number,
    isReversed?: boolean
): { left: number; top: number; width: number; height: number } | null {
    // 開始位置と終了位置が同じ場合は表示しない
    if (startOffset === endOffset) return null;

    const itemInfo = positionMap[itemId];
    if (!itemInfo) return null;

    const { textElement, lineHeight } = itemInfo;

    // ツリーコンテナを取得
    const treeContainer = overlayRef.closest('.tree-container');
    if (!treeContainer) return null;

    try {
        // 最新の位置情報を取得するため、常に新たに計測
        // テキスト要素の絶対位置
        const textRect = textElement.getBoundingClientRect();

        // ツリーコンテナの絶対位置
        const treeContainerRect = treeContainer.getBoundingClientRect();

        // テキストコンテンツを取得
        const text = textElement.textContent || '';

        // 開始と終了が逆転している場合は入れ替え
        const actualStart = Math.min(startOffset, endOffset);
        const actualEnd = Math.max(startOffset, endOffset);

        const textBeforeStart = text.substring(0, actualStart);
        const selectedText = text.substring(actualStart, actualEnd);

        // 開始位置の計算
        const startSpan = createMeasurementSpan(itemId, textBeforeStart);
        textElement.parentElement?.appendChild(startSpan);
        const startX = startSpan.getBoundingClientRect().width;
        textElement.parentElement?.removeChild(startSpan);

        // 選択範囲の幅を計算
        const selectionSpan = createMeasurementSpan(itemId, selectedText);
        textElement.parentElement?.appendChild(selectionSpan);
        const width = selectionSpan.getBoundingClientRect().width || 5; // 最小幅を確保
        textElement.parentElement?.removeChild(selectionSpan);

        // テキスト要素の左端からの距離
        const contentContainer = textElement.closest('.item-content-container');
        const contentRect = contentContainer?.getBoundingClientRect() || textRect;

        // ツリーコンテナを基準にした位置
        const contentLeft = contentRect.left - treeContainerRect.left;

        // 最終位置計算
        const relativeLeft = contentLeft + startX;
        const relativeTop = textRect.top - treeContainerRect.top + 3;

        // 高さは行の高さを使用
        const height = lineHeight || textRect.height || 20;

        if (DEBUG_MODE) {
            console.log(`Selection for ${itemId} from ${actualStart} to ${actualEnd}:`, {
                relativeLeft, relativeTop, width, height,
                contentLeft,
                textRectTop: textRect.top,
                treeContainerTop: treeContainerRect.top,
                selectedText: selectedText.replaceAll('\n', '\\n'),
                isReversed
            });
        }

        return {
            left: relativeLeft,
            top: relativeTop,
            width,
            height
        };
    } catch (error) {
        console.error('Error calculating selection range:', error);
        return null;
    }
}

// DOMが変更された時に位置マッピングを更新する関数
function updatePositionMap() {
    const newMap: CursorPositionMap = {};

    // すべてのアイテムとそのテキスト要素を取得
    const itemElements = document.querySelectorAll('[data-item-id]');

    itemElements.forEach(itemElement => {
        const itemId = itemElement.getAttribute('data-item-id');
        if (!itemId) return;

        const textElement = itemElement.querySelector('.item-text');
        if (!textElement || !(textElement instanceof HTMLElement)) return;

        // 要素の位置情報を取得
        const elementRect = itemElement.getBoundingClientRect();

        // コンテンツコンテナの位置情報
        const contentContainer = textElement.closest('.item-content-container');
        if (!contentContainer) return;

        // コンピュートされたスタイルを取得
        const styles = window.getComputedStyle(textElement);
        const lineHeight = parseFloat(styles.lineHeight) || textElement.getBoundingClientRect().height;

        // フォント関連のプロパティを保存
        const fontProperties = {
            fontFamily: styles.fontFamily,
            fontSize: styles.fontSize,
            fontWeight: styles.fontWeight,
            letterSpacing: styles.letterSpacing
        };

        newMap[itemId] = {
            elementRect,
            textElement,
            lineHeight,
            fontProperties
        };
    });

    positionMap = newMap;

    if (DEBUG_MODE) {
        console.log("Position map updated:", Object.keys(newMap));
    }
}

// MutationObserver を使用してDOMの変更を監視
let mutationObserver: MutationObserver;

// 位置マップの更新をdebounce（頻度制限）するための変数
let updatePositionMapTimer: number;

// 位置マップをdebounce付きで更新
function debouncedUpdatePositionMap() {
    clearTimeout(updatePositionMapTimer);
    updatePositionMapTimer = setTimeout(() => {
        updatePositionMap();
    }, 100) as unknown as number;
}

// store からのデータを反映するリアクティブ処理
$effect(() => {
  // DOM 更新を反映して positionMap を更新
  updatePositionMap();
  allCursors = Object.values(store.cursors);
  allSelections = Object.values(store.selections);
  localActiveItemId = store.activeItemId;
  localCursorVisible = store.cursorVisible;
  localAnimationPaused = store.animationPaused;
});

// MutationObserver を設定して DOM の変更を監視
onMount(() => {
    // 初期位置マップの作成
    updatePositionMap();

    // copyイベントを監視
    document.addEventListener('copy', handleCopy as EventListener);
    // pasteイベントを監視 (マルチラインペースト)
    document.addEventListener('paste', handlePaste as EventListener);

    // MutationObserverを単純化 - 変更検出後すぐに再計算するのではなく、
    // debounceを使用して頻度を制限
    mutationObserver = new MutationObserver(() => {
        debouncedUpdatePositionMap();
    });

    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });

    // リサイズやスクロール時に位置マップを更新
    window.addEventListener('resize', debouncedUpdatePositionMap);
    window.addEventListener('scroll', debouncedUpdatePositionMap);

    // 初期状態でアクティブカーソルがある場合は、少し遅延してから点滅を開始
    setTimeout(() => {
        if (allCursors.some(cursor => cursor.isActive)) {
            store.startCursorBlink();
        }
    }, 200);
});

onDestroy(() => {
    // MutationObserver の切断
    if (mutationObserver) {
        mutationObserver.disconnect();
    }

    // copyイベントリスナー解除
    document.removeEventListener('copy', handleCopy as EventListener);
    // pasteイベントリスナー解除
    document.removeEventListener('paste', handlePaste as EventListener);

    // イベントリスナーの削除
    window.removeEventListener('resize', debouncedUpdatePositionMap);
    window.removeEventListener('scroll', debouncedUpdatePositionMap);

    // タイマーのクリア
    clearTimeout(updatePositionMapTimer);

    // カーソル点滅タイマーの停止
    stopCursorBlink();
});

// 複数アイテム選択をクリップボードにコピー
function handleCopy(event: ClipboardEvent) {
  // startOffsetとendOffsetが等しい範囲は対象外
  const selections = allSelections.filter(sel => sel.startOffset !== sel.endOffset);
  if (selections.length === 0) return;
  event.preventDefault();
  // アイテムDOM順にテキストを連結
  const itemEls = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLDivElement[];
  let copied = '';
  for (const itemEl of itemEls) {
    const itemId = itemEl.getAttribute('data-item-id');
    // 開始または終了アイテムと一致するか
    const sel = selections.find(s =>
      s.startItemId === itemId || s.endItemId === itemId
    );
    if (sel) {
      const textEl = itemEl.querySelector('.item-text') as HTMLElement;
      const text = textEl?.textContent || '';
      copied += text.substring(sel.startOffset, sel.endOffset) + '\n';
    }
  }
  if (copied.endsWith('\n')) copied = copied.slice(0, -1);
  // クリップボードに書き込み
  if (event.clipboardData) {
    event.clipboardData.setData('text/plain', copied);
  }
  // テスト・フォーカス保持のため、常に隠しtextareaを更新しフォーカス
  if (clipboardRef) {
    clipboardRef.value = copied;
  }
}

// マルチラインペーストを上位に通知
function handlePaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain') || '';
  if (!text) return;
  // 複数行テキストの場合はマルチアイテムペーストとみなす
  if (text.includes('\n')) {
    event.preventDefault();
    const lines = text.split(/\r?\n/);
    // 選択中の範囲を通知
    dispatch('paste-multi-item', {
      lines,
      selections: allSelections.filter(s => s.startOffset !== s.endOffset),
      activeItemId: localActiveItemId,
    });
  }
}
</script>

<div class="editor-overlay" bind:this={overlayRef} class:paused={store.animationPaused} class:visible={store.cursorVisible}>
    <!-- 隠しクリップボード用textarea -->
    <textarea bind:this={clipboardRef} class="clipboard-textarea"></textarea>
    <!-- 選択範囲のレンダリング -->
    {#each Object.values(store.selections) as sel}
        {#if sel.startOffset !== sel.endOffset}
            {#if sel.startItemId === sel.endItemId}
                <!-- 単一アイテム選択 -->
                {@const rect = calculateSelectionPixelRange(sel.startItemId, sel.startOffset, sel.endOffset, sel.isReversed)}
                {#if rect}
                    {@const isPageTitle = sel.startItemId === "page-title"}
                    <div
                        class="selection"
                        class:page-title-selection={isPageTitle}
                        class:selection-reversed={sel.isReversed}
                        style="position:absolute; left:{rect.left}px; top:{rect.top}px; width:{rect.width}px; height:{isPageTitle?'1.5em':rect.height}px; background-color:rgba(0, 120, 215, 0.2); pointer-events:none;"
                    ></div>
                {/if}
            {:else}
                <!-- マルチアイテム選択 -->
                {@const allEls = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLElement[]}
                {@const ids = allEls.map(el => el.getAttribute('data-item-id')!)}
                {@const sIdx = ids.indexOf(sel.startItemId)}
                {@const eIdx = ids.indexOf(sel.endItemId)}
                {@const forward = !sel.isReversed}
                {@const startIdx = forward ? sIdx : eIdx}
                {@const endIdx   = forward ? eIdx : sIdx}
                {#each ids.slice(startIdx, endIdx + 1) as itemId}
                    {@const textEl = document.querySelector(`[data-item-id="${itemId}"] .item-text`) as HTMLElement}
                    {@const len = textEl?.textContent?.length || 0}
                    <!-- offset 計算: 開始アイテム, 終了アイテム, その他 -->
                    {@const startOff = itemId === sel.startItemId
                        ? (forward ? sel.startOffset : 0)
                        : itemId === sel.endItemId
                        ? (forward ? 0 : sel.endOffset)
                        : 0}
                    {@const endOff = itemId === sel.startItemId
                        ? (forward ? len : sel.startOffset)
                        : itemId === sel.endItemId
                        ? (forward ? sel.endOffset : len)
                        : len}
                    {@const rect = calculateSelectionPixelRange(itemId, startOff, endOff, sel.isReversed)}
                    {#if rect}
                        {@const isPageTitle = itemId === 'page-title'}
                        <div
                            class="selection"
                            class:page-title-selection={isPageTitle}
                            class:selection-reversed={sel.isReversed}
                            style="position:absolute; left:{rect.left}px; top:{rect.top}px; width:{rect.width}px; height:{isPageTitle?'1.5em':rect.height}px; background-color:rgba(0, 120, 215, 0.2); pointer-events:none;"
                        ></div>
                    {/if}
                {/each}
            {/if}
        {/if}
    {/each}

    <!-- カーソルのレンダリング -->
    {#each Object.values(store.cursors) as cursor}
        {@const cursorPos = calculateCursorPixelPosition(cursor.itemId, cursor.offset)}
        {#if cursorPos}
            {@const isPageTitle = cursor.itemId === "page-title"}
            {@const isActive = cursor.isActive}
            <!-- カーソル位置のみスタイルで指定し、点滅はCSSクラスに任せる -->
            <div
                class="cursor"
                class:active={isActive}
                class:page-title-cursor={isPageTitle}
                data-offset={cursor.offset}
                style="
                    position: absolute;
                    left: {cursorPos.left}px;
                    top: {cursorPos.top}px;
                    height: {isPageTitle ? '1.5em' : positionMap[cursor.itemId]?.lineHeight || '1.2em'};
                    background-color: {cursor.color || '#0078d7'};
                    pointer-events: none;
                "
                title={cursor.userName || ''}
            ></div>
        {/if}
    {/each}

    {#if DEBUG_MODE && localActiveItemId}
        <div class="debug-info">
            カーソル位置: アイテム {localActiveItemId}
            {#if allCursors.length > 0}
                <br>オフセット: {allCursors[0].offset}
            {/if}
        </div>
    {/if}
</div>

<style>
.editor-overlay {
    /* outline: 2px dashed red;  デバッグ用なので削除 */
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none !important;
    z-index: 100;
    /* background-color: rgba(255, 0, 0, 0.1) !important; デバッグ用なので削除 */
    will-change: transform;
}

/* blink via JS-driven visibility */
.editor-overlay .cursor.active {
    opacity: 0;
    visibility: hidden;
}
.editor-overlay.visible .cursor.active {
    opacity: 1;
    visibility: visible;
}

.cursor {
    display: block;
    position: absolute;
    width: 2px;
    height: 1.2em;
    background-color: #0078d7;
    pointer-events: none !important;
    will-change: transform;
    z-index: 200;
    border: 1px solid black;  /* デバッグ: カーソル枠 */
}

.page-title-cursor {
    width: 3px;
}

.cursor.active {
    /* アニメーションはJS制御のvisibilityで同期 */
    pointer-events: none !important;
    border-color: rgb(0, 0, 0);  /* デバッグ: アクティブカーソル枠 */
}

.selection {
    display: none;
    position: absolute;
    background-color: rgba(0, 120, 215, 0.2);
    pointer-events: none !important;
    will-change: transform;
}

.selection-reversed {
    border-left: 1px solid rgba(0, 120, 215, 0.5);
}

.page-title-selection {
    background-color: rgba(0, 120, 215, 0.15);
}

.debug-info {
    position: fixed;
    bottom: 10px;
    right: 10px;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    pointer-events: none !important;
}

.clipboard-textarea {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    opacity: 0;
}
</style>