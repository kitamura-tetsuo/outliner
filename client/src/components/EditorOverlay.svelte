<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { editorOverlayStore, type CursorPosition, type SelectionRange } from '../stores/EditorOverlayStore';

// デバッグモード
const DEBUG_MODE = false;

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

// カーソルと選択範囲のマッピング情報
let positionMap = $state<CursorPositionMap>({});
// すべてのカーソル位置
let allCursors = $state<CursorPosition[]>([]);
// すべての選択範囲
let allSelections = $state<SelectionRange[]>([]);
// アクティブアイテムID
let activeItemId = $state<string | null>(null);
// ストアからカーソル点滅状態を取得
let cursorVisible = $state(false);
// ストアからアニメーション一時停止状態を取得
let animationPaused = $state(false);

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
        // アイテム情報がない場合、マップを更新してみる
        updatePositionMap();
        // 再度確認
        if (!positionMap[itemId]) {
            if (DEBUG_MODE) {
                console.warn(`No item info found for ${itemId} after update`);
            }
            return null;
        }
        return calculateCursorPixelPosition(itemId, offset);
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
        const textBeforeCursor = text.substring(0, offset);
        
        // 仮想span要素を使用してオフセット位置のピクセル値を計算
        const span = createMeasurementSpan(itemId, textBeforeCursor);
        
        // 一時的に親要素に追加して測定
        textElement.parentElement?.appendChild(span);
        const cursorWidth = span.getBoundingClientRect().width;
        textElement.parentElement?.removeChild(span);
        
        // テキスト要素の左端からの距離
        const contentContainer = textElement.closest('.item-content-container');
        const contentRect = contentContainer?.getBoundingClientRect() || textRect;
        
        // ツリーコンテナを基準にした位置
        const contentLeft = contentRect.left - treeContainerRect.left;
        
        // テキスト要素内でのカーソル位置
        const relativeLeft = contentLeft + cursorWidth;
        
        // Y座標は常に最新の値を使用
        const relativeTop = textRect.top - treeContainerRect.top + 3; // 微調整（+3px）
        
        if (DEBUG_MODE) {
            console.log(`Cursor for ${itemId} at offset ${offset}:`, { 
                relativeLeft, relativeTop, 
                cursorWidth,
                contentLeft,
                textRectTop: textRect.top,
                treeContainerTop: treeContainerRect.top,
                offsetText: textBeforeCursor.replaceAll('\n', '\\n'),
                fullText: text.replaceAll('\n', '\\n')
            });
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

// editorOverlayStore からのデータを監視し、状態を更新
editorOverlayStore.subscribe(state => {
    // アクティブアイテムが変わった場合
    const activeItemChanged = state.activeItemId !== activeItemId;
    
    // 状態を更新
    allCursors = Object.values(state.cursors);
    allSelections = Object.values(state.selections);
    const previousActiveItemId = activeItemId;
    activeItemId = state.activeItemId;
    cursorVisible = state.cursorVisible;
    animationPaused = state.animationPaused;
    
    if (activeItemChanged) {
        if (DEBUG_MODE) {
            console.log(`Active item changed from ${previousActiveItemId} to ${state.activeItemId}`);
        }
        
        // アイテム間移動時のカーソル位置更新を確実にするための処理
        updatePositionMap();
        
        // アイテム間移動時は、カーソルを表示し、アニメーションを一時停止するようストアに通知
        editorOverlayStore.startCursorBlink();
        
        // カーソルとセレクションが存在する場合は、再計算を強制
        // 単一の遅延処理で、DOM更新が確実に完了した後に実行
        setTimeout(() => {
            updatePositionMap();
            
            // 現在のアクティブアイテムのカーソル情報を取得
            const activeCursor = state.cursors["local"];
            if (activeCursor && activeCursor.itemId === state.activeItemId) {
                // カーソル位置を再設定して更新を促す（クリアはしない）
                editorOverlayStore.setCursor({
                    ...activeCursor,
                    isActive: true
                });
                
                // アイテム移動後にカーソル点滅を再開始（強制表示期間を含む）
                editorOverlayStore.startCursorBlink();
            }
        }, 100); // 100msの遅延で十分なDOM更新時間を確保
    } else {
        // カーソル位置のみ更新された場合の処理
        debouncedUpdatePositionMap();
    }
});

// MutationObserver を設定して DOM の変更を監視
onMount(() => {
    // 初期位置マップの作成
    updatePositionMap();
    
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
            editorOverlayStore.startCursorBlink();
        }
    }, 200);
});

onDestroy(() => {
    // MutationObserver の切断
    if (mutationObserver) {
        mutationObserver.disconnect();
    }
    
    // イベントリスナーの削除
    window.removeEventListener('resize', debouncedUpdatePositionMap);
    window.removeEventListener('scroll', debouncedUpdatePositionMap);
    
    // タイマーのクリア
    clearTimeout(updatePositionMapTimer);
    
    // カーソル点滅タイマーの停止
    editorOverlayStore.stopCursorBlink();
});
</script>

<div class="editor-overlay" bind:this={overlayRef}>
    <!-- 選択範囲のレンダリング -->
    {#each allSelections as selection}
        {#if selection.startOffset !== selection.endOffset}
            {@const selectionRect = calculateSelectionPixelRange(selection.itemId, selection.startOffset, selection.endOffset, selection.isReversed)}
            {#if selectionRect}
                {@const isPageTitle = selection.itemId === "page-title"}
                <div 
                    class="selection" 
                    class:page-title-selection={isPageTitle}
                    class:selection-reversed={selection.isReversed}
                    style="
                        position: absolute;
                        left: {selectionRect.left}px; 
                        top: {selectionRect.top}px; 
                        width: {selectionRect.width}px; 
                        height: {isPageTitle ? '1.5em' : selectionRect.height}px;
                        background-color: {selection.color ? `${selection.color}33` : 'rgba(0, 120, 215, 0.2)'};
                        pointer-events: none;
                    "
                    title={selection.userName || ''}
                ></div>
            {/if}
        {/if}
    {/each}
    
    <!-- カーソルのレンダリング -->
    {#each allCursors as cursor}
        {@const cursorPos = calculateCursorPixelPosition(cursor.itemId, cursor.offset)}
        {#if cursorPos}
            {@const isPageTitle = cursor.itemId === "page-title"}
            {@const isActive = cursor.isActive}
            <!-- 常にカーソルをレンダリングし、アニメーションでの点滅を有効に -->
            <div 
                class="cursor" 
                class:active={isActive}
                class:page-title-cursor={isPageTitle}
                style="
                    position: absolute;
                    left: {cursorPos.left}px; 
                    top: {cursorPos.top}px; 
                    height: {isPageTitle ? '1.5em' : positionMap[cursor.itemId]?.lineHeight || '1.2em'};
                    background-color: {cursor.color || '#0078d7'};
                    pointer-events: none;
                    visibility: {!isActive ? 'visible' : null};
                    opacity: {!isActive ? 1 : null};
                    animation-play-state: {isActive ? (animationPaused ? 'paused' : 'running') : 'paused'};
                "
                title={cursor.userName || ''}
            ></div>
        {/if}
    {/each}
    
    {#if DEBUG_MODE && activeItemId}
        <div class="debug-info">
            カーソル位置: アイテム {activeItemId}
            {#if allCursors.length > 0}
                <br>オフセット: {allCursors[0].offset}
            {/if}
        </div>
    {/if}
</div>

<style>
.editor-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none !important;
    z-index: 100;
    will-change: transform;
}

.cursor {
    position: absolute;
    width: 2px;
    height: 1.2em;
    background-color: #0078d7;
    pointer-events: none !important;
    will-change: transform;
    z-index: 200; /* より高い値を設定 */
}

.page-title-cursor {
    width: 3px; /* タイトル用のカーソルを少し太く */
}

.cursor.active {
    animation: blink 1.06s steps(1) infinite;
    animation-play-state: running;
    pointer-events: none !important;
}

.selection {
    position: absolute;
    background-color: rgba(0, 120, 215, 0.2);
    pointer-events: none !important;
    will-change: transform;
}

.selection-reversed {
    /* 逆方向選択の場合のスタイル調整（必要に応じて） */
    border-left: 1px solid rgba(0, 120, 215, 0.5);
}

.page-title-selection {
    background-color: rgba(0, 120, 215, 0.15); /* タイトル用の選択範囲を少し薄く */
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

@keyframes blink {
    0%, 49% { 
        opacity: 1; 
        visibility: visible;
    }
    50%, 100% { 
        opacity: 0; 
        visibility: hidden;
    }
}
</style> 