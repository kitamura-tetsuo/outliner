<script lang="ts">
import { createEventDispatcher, onDestroy, onMount } from 'svelte';
import type { CursorPosition, SelectionRange } from '../stores/EditorOverlayStore.svelte';
import { editorOverlayStore as store } from '../stores/EditorOverlayStore.svelte';

// store API (関数のみ)
const { stopCursorBlink } = store;

// デバッグモード
let DEBUG_MODE = $state(false);

// デバッグモードの変更を監視して、グローバル変数を更新
$effect(() => {
    if (typeof window !== 'undefined') {
        (window as any).DEBUG_MODE = DEBUG_MODE;
        console.log(`Debug mode ${DEBUG_MODE ? 'enabled' : 'disabled'}`);

        // カーソル状態をログに出力
        if (DEBUG_MODE) {
            store.logCursorState();
        }
    }
});
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

// テキストエリアの位置を更新する$effect
$effect(() => {
    // 依存関係を明示的に追跡
    const cursors = store.cursors; // カーソルの変更を追跡
    const activeItemId = store.activeItemId; // アクティブアイテムの変更を追跡
    const currentPositionMap = positionMap; // positionMapの変更を追跡
    const textareaRef = store.getTextareaRef();

    if (!textareaRef || !overlayRef) return;

    const lastCursor = store.getLastActiveCursor();
    if (!lastCursor) return;

    // 即座に位置を更新し、positionMapが不完全な場合は再試行
    updateTextareaPosition();

    function updateTextareaPosition() {
        if (!lastCursor || !textareaRef) return;

        // positionMapの更新も監視
        const itemInfo = currentPositionMap[lastCursor.itemId];
        if (!itemInfo) {
            // positionMapが更新されていない場合は、強制的に更新してから再試行
            updatePositionMap();
            setTimeout(() => {
                updateTextareaPosition();
            }, 50);
            return;
        }

        const pos = calculateCursorPixelPosition(lastCursor.itemId, lastCursor.offset);
        if (!pos) {
            // 位置計算に失敗した場合も、positionMapを更新してから再試行
            updatePositionMap();
            setTimeout(() => {
                updateTextareaPosition();
            }, 50);
            return;
        }

        const treeContainer = overlayRef.closest('.tree-container');
        if (!treeContainer) return;

        const rect = treeContainer.getBoundingClientRect();

        // デバッグ情報を追加
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log('Textarea positioning debug:', {
                cursorItemId: lastCursor.itemId,
                cursorOffset: lastCursor.offset,
                calculatedPos: pos,
                treeContainerRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                finalLeft: rect.left + pos.left,
                finalTop: rect.top + pos.top,
                hasItemInfo: !!itemInfo
            });
        }

        // posは既にtreeContainerを基準とした相対位置なので、
        // ページ上の絶対位置にするためにrectの位置を加算する
        textareaRef.style.left = `${rect.left + pos.left}px`;
        textareaRef.style.top = `${rect.top + pos.top}px`;
        const height = currentPositionMap[lastCursor.itemId]?.lineHeight || 16;
        textareaRef.style.height = `${height}px`;
    }
});

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
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
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

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
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

    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
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
    // cutイベントを監視
    document.addEventListener('cut', handleCut as EventListener);
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
    // cutイベントリスナー解除
    document.removeEventListener('cut', handleCut as EventListener);
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
  // デバッグ情報
  if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
    console.log(`handleCopy called`);
  }

  // 選択範囲がない場合は何もしない
  const selections = allSelections.filter(sel =>
    sel.startOffset !== sel.endOffset || sel.startItemId !== sel.endItemId
  );

  if (selections.length === 0) return;

  // ブラウザのデフォルトコピー動作を防止
  event.preventDefault();

  // EditorOverlayStoreのgetSelectedTextメソッドを使用
  const store = (window as any).editorOverlayStore;
  if (!store) {
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
      console.log(`EditorOverlayStore not found`);
    }
    return;
  }

  // 選択範囲のテキストを取得
  const selectedText = store.getSelectedText('local');

  // デバッグ情報
  if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
    console.log(`Selected text from store: "${selectedText}"`);
  }

  // 選択範囲のテキストが取得できた場合
  if (selectedText) {
    // クリップボードに書き込み
    if (event.clipboardData) {
      // プレーンテキスト形式
      event.clipboardData.setData('text/plain', selectedText);

      // マルチカーソル選択の場合、VS Code固有のメタデータを追加
      const cursorInstances = store.getCursorInstances();
      if (cursorInstances.length > 1) {
        // 各カーソルの選択テキストを取得
        const multicursorText: string[] = [];

        // 各カーソルの選択テキストを収集
        cursorInstances.forEach((cursor: any) => {
          const itemId = cursor.itemId;

          // 該当するアイテムの選択範囲を探す
          const selection = Object.values(store.selections).find((sel: any) =>
            sel.startItemId === itemId || sel.endItemId === itemId
          );

          if (selection) {
            // 選択範囲のテキストを取得
            const selText = store.getTextFromSelection(selection);
            if (selText) {
              multicursorText.push(selText);
            }
          }
        });

        // マルチカーソルテキストが取得できた場合
        if (multicursorText.length > 0) {
          // VS Code固有のメタデータを設定
          const vscodeMetadata = {
            version: 1,
            isFromEmptySelection: false,
            multicursorText: multicursorText,
            mode: 'plaintext',
            pasteMode: 'spread' // デフォルトはspread
          };

          // メタデータをJSON文字列に変換
          const vscodeMetadataStr = JSON.stringify(vscodeMetadata);

          // VS Code固有のメタデータを設定
          event.clipboardData.setData('application/vscode-editor', vscodeMetadataStr);

          // デバッグ情報
          if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`VS Code metadata added:`, vscodeMetadata);
          }
        }
      }

      // 矩形選択（ボックス選択）の場合
      // 現在は実装されていないが、将来的に実装する可能性がある
      // ここでは単純に複数行テキストとして処理
      if (selectedText.includes('\n')) {
        // 複数行テキストを検出
        const lineCount = selectedText.split(/\r?\n/).length;

        // VS Code固有のメタデータを設定
        const vscodeMetadata = {
          version: 1,
          isFromEmptySelection: false,
          mode: 'plaintext',
          lineCount: lineCount
        };

        // メタデータをJSON文字列に変換
        const vscodeMetadataStr = JSON.stringify(vscodeMetadata);

        // VS Code固有のメタデータを設定
        event.clipboardData.setData('application/vscode-editor', vscodeMetadataStr);

        // デバッグ情報
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
          console.log(`VS Code metadata added for multi-line text:`, vscodeMetadata);
        }
      }
    }

    // テスト・フォーカス保持のため、常に隠しtextareaを更新
    if (clipboardRef) {
      clipboardRef.value = selectedText;
    }

    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
      console.log(`Clipboard updated with: "${selectedText}"`);
    }
    return;
  }

  // 選択範囲のテキストが取得できなかった場合のフォールバック処理

  // 単一アイテム内の選択範囲の場合
  if (selections.length === 1 && selections[0].startItemId === selections[0].endItemId) {
    const sel = selections[0];
    const textEl = document.querySelector(`[data-item-id="${sel.startItemId}"] .item-text`) as HTMLElement;
    if (!textEl) return;

    const text = textEl.textContent || '';
    const startOffset = Math.min(sel.startOffset, sel.endOffset);
    const endOffset = Math.max(sel.startOffset, sel.endOffset);
    const selectedText = text.substring(startOffset, endOffset);

    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
      console.log(`Single item selection: "${selectedText}"`);
    }

    // クリップボードに書き込み
    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', selectedText);
    }

    // テスト・フォーカス保持のため、常に隠しtextareaを更新
    if (clipboardRef) {
      clipboardRef.value = selectedText;
    }
    return;
  }

  // 複数アイテムにまたがる選択範囲の場合
  // DOM上の順序でアイテムを取得
  const allItems = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLElement[];
  const allItemIds = allItems.map(el => el.getAttribute('data-item-id')!);

  let combinedText = '';

  // 各選択範囲を処理
  for (const sel of selections) {
    // 単一アイテム内の選択範囲
    if (sel.startItemId === sel.endItemId) {
      const textEl = document.querySelector(`[data-item-id="${sel.startItemId}"] .item-text`) as HTMLElement;
      if (!textEl) continue;

      const text = textEl.textContent || '';
      const startOffset = Math.min(sel.startOffset, sel.endOffset);
      const endOffset = Math.max(sel.startOffset, sel.endOffset);

      combinedText += text.substring(startOffset, endOffset);
      if (combinedText && !combinedText.endsWith('\n')) {
        combinedText += '\n';
      }
      continue;
    }

    // 複数アイテムにまたがる選択範囲
    const startIdx = allItemIds.indexOf(sel.startItemId);
    const endIdx = allItemIds.indexOf(sel.endItemId);

    if (startIdx === -1 || endIdx === -1) {
      if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Start or end item not found in DOM: startIdx=${startIdx}, endIdx=${endIdx}`);
      }
      continue;
    }

    // 選択範囲の方向を考慮
    const isReversed = sel.isReversed || false;

    // 開始と終了のインデックスを決定
    const firstIdx = Math.min(startIdx, endIdx);
    const lastIdx = Math.max(startIdx, endIdx);

    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
      console.log(`Multi-item selection: firstIdx=${firstIdx}, lastIdx=${lastIdx}, isReversed=${isReversed}`);
    }

    // 選択範囲内の各アイテムを処理
    for (let i = firstIdx; i <= lastIdx; i++) {
      const item = allItems[i];
      const itemId = item.getAttribute('data-item-id')!;
      const textEl = item.querySelector('.item-text') as HTMLElement;

      if (!textEl) continue;

      const text = textEl.textContent || '';
      const len = text.length;

      // オフセット計算
      let startOff = 0;
      let endOff = len;

      // 開始アイテム
      if (itemId === sel.startItemId) {
        startOff = sel.startOffset;
      }

      // 終了アイテム
      if (itemId === sel.endItemId) {
        endOff = sel.endOffset;
      }

      // デバッグ情報
      if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Item ${i} (${itemId}) offsets: start=${startOff}, end=${endOff}, text="${text.substring(startOff, endOff)}"`);
      }

      // テキストを追加
      combinedText += text.substring(startOff, endOff);

      // 最後のアイテム以外は改行を追加
      if (i < lastIdx) {
        combinedText += '\n';
      }
    }
  }

  // 最後の改行を削除（必要な場合）
  if (combinedText.endsWith('\n')) {
    combinedText = combinedText.slice(0, -1);
  }

  // デバッグ情報
  if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
    console.log(`Final combined text: "${combinedText}"`);
  }

  // クリップボードに書き込み
  if (event.clipboardData && combinedText) {
    event.clipboardData.setData('text/plain', combinedText);
  }

  // テスト・フォーカス保持のため、常に隠しtextareaを更新
  if (clipboardRef && combinedText) {
    clipboardRef.value = combinedText;
  }
}

// 複数アイテム選択をクリップボードにカットする
function handleCut(event: ClipboardEvent) {
  // デバッグ情報
  if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
    console.log(`handleCut called`);
  }

  // 選択範囲がない場合は何もしない
  const selections = allSelections.filter(sel =>
    sel.startOffset !== sel.endOffset || sel.startItemId !== sel.endItemId
  );

  if (selections.length === 0) return;

  // ブラウザのデフォルトカット動作を防止
  event.preventDefault();

  // 選択されたテキストを取得
  const selectedText = store.getSelectedText('local');

  // グローバル変数にテキストを保存（テスト用）
  if (typeof window !== 'undefined' && selectedText) {
    (window as any).lastCopiedText = selectedText;
    console.log(`Cut: Saved text to global variable: "${selectedText}"`);
  }

  // まずコピー処理を実行
  handleCopy(event);

  // 選択範囲を削除
  const cursors = store.getCursorInstances();
  if (cursors.length > 0) {
    // 最初のカーソルを使用して選択範囲を削除
    cursors[0].deleteSelection();
  }

  // デバッグ情報
  if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
    console.log(`Cut operation completed`);
  }
}

// マルチラインペーストを上位に通知
function handlePaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain') || '';
  if (!text) return;

  // 選択範囲がある場合は、選択範囲を削除してからペースト
  const selections = allSelections.filter(sel =>
    sel.startOffset !== sel.endOffset || sel.startItemId !== sel.endItemId
  );

  // デバッグ情報
  if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
    console.log(`handlePaste called with text: "${text}"`);
    console.log(`Current selections:`, selections);
  }

  // 複数行テキストの場合はマルチアイテムペーストとみなす
  if (text.includes('\n')) {
    event.preventDefault();
    const lines = text.split(/\r?\n/);

    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
      console.log(`Multi-line paste detected, lines:`, lines);
      console.log(`Lines count: ${lines.length}`);
      lines.forEach((line, i) => console.log(`Line ${i}: "${line}"`));
    }

    // 選択中の範囲を通知
    dispatch('paste-multi-item', {
      lines,
      selections,
      activeItemId: localActiveItemId,
    });
    return;
  }

  // 複数アイテムにまたがる選択範囲がある場合は、選択範囲を削除してからペースト
  if (selections.some(sel => sel.startItemId !== sel.endItemId)) {
    event.preventDefault();

    // 単一行テキストを単一行配列として扱う
    const lines = [text];

    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
      console.log(`Multi-item selection paste detected, text: "${text}"`);
    }

    // 選択中の範囲を通知
    dispatch('paste-multi-item', {
      lines,
      selections,
      activeItemId: localActiveItemId,
    });
    return;
  }

  // 単一アイテム内の選択範囲がある場合も、選択範囲を削除してからペースト
  if (selections.length > 0) {
    // 選択範囲がある場合は、ブラウザのデフォルト動作に任せる
    // Cursor.insertText()メソッドが選択範囲を削除してからテキストを挿入する
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
      console.log(`Single item selection paste, using default browser behavior`);
    }
    return;
  }

  // 選択範囲がない場合は、ブラウザのデフォルト動作に任せる
  if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
    console.log(`No selection paste, using default browser behavior`);
  }
}
</script>

<div class="editor-overlay" bind:this={overlayRef} class:paused={store.animationPaused} class:visible={store.cursorVisible}>
    <!-- デバッグボタン -->
    <button
        class="debug-button"
        class:active={DEBUG_MODE}
        onclick={() => DEBUG_MODE = !DEBUG_MODE}
        title="デバッグモードの切り替え"
    >
        D
    </button>

    <!-- 隠しクリップボード用textarea -->
    <textarea bind:this={clipboardRef} class="clipboard-textarea"></textarea>
    <!-- 選択範囲のレンダリング -->
    {#each Object.values(store.selections) as sel}
        {#if sel.startOffset !== sel.endOffset || sel.startItemId !== sel.endItemId}
            {#if sel.isBoxSelection && sel.boxSelectionRanges}
                <!-- 矩形選択（ボックス選択）の場合 -->
                {#each sel.boxSelectionRanges as range, index}
                    {@const rect = calculateSelectionPixelRange(range.itemId, range.startOffset, range.endOffset, sel.isReversed)}
                    {#if rect}
                        {@const isPageTitle = range.itemId === "page-title"}
                        {@const isFirstRange = index === 0}
                        {@const isLastRange = index === sel.boxSelectionRanges.length - 1}
                        {@const isStartItem = range.itemId === sel.startItemId}
                        {@const isEndItem = range.itemId === sel.endItemId}

                        <!-- 矩形選択範囲の背景 -->
                        <div
                            class="selection selection-box"
                            class:page-title-selection={isPageTitle}
                            class:selection-box-first={isFirstRange}
                            class:selection-box-last={isLastRange}
                            class:selection-box-start={isStartItem}
                            class:selection-box-end={isEndItem}
                            style="position:absolute; left:{rect.left}px; top:{rect.top}px; width:{rect.width}px; height:{isPageTitle?'1.5em':rect.height}px; pointer-events:none;"
                        ></div>

                        <!-- 開始位置と終了位置のマーカー -->
                        {#if isStartItem}
                            <div
                                class="selection-box-marker selection-box-start-marker"
                                style="position:absolute; left:{rect.left - 2}px; top:{rect.top - 2}px; pointer-events:none;"
                                title="選択開始位置"
                            ></div>
                        {/if}

                        {#if isEndItem}
                            <div
                                class="selection-box-marker selection-box-end-marker"
                                style="position:absolute; left:{rect.left + rect.width - 4}px; top:{rect.top + rect.height - 4}px; pointer-events:none;"
                                title="選択終了位置"
                            ></div>
                        {/if}
                    {/if}
                {/each}
            {:else if sel.startItemId === sel.endItemId}
                <!-- 単一アイテム選択 -->
                {@const rect = calculateSelectionPixelRange(sel.startItemId, sel.startOffset, sel.endOffset, sel.isReversed)}
                {#if rect}
                    {@const isPageTitle = sel.startItemId === "page-title"}
                    <div
                        class="selection"
                        class:page-title-selection={isPageTitle}
                        class:selection-reversed={sel.isReversed}
                        class:selection-forward={!sel.isReversed}
                        style="position:absolute; left:{rect.left}px; top:{rect.top}px; width:{rect.width}px; height:{isPageTitle?'1.5em':rect.height}px; pointer-events:none;"
                    ></div>
                {/if}
            {:else}
                <!-- マルチアイテム選択 -->
                {@const allEls = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLElement[]}
                {@const ids = allEls.map(el => el.getAttribute('data-item-id')!)}
                {@const sIdx = ids.indexOf(sel.startItemId)}
                {@const eIdx = ids.indexOf(sel.endItemId)}

                <!-- インデックスが見つからない場合はスキップ -->
                {#if sIdx >= 0 && eIdx >= 0}
                    {@const forward = !sel.isReversed}
                    {@const startIdx = forward ? sIdx : eIdx}
                    {@const endIdx   = forward ? eIdx : sIdx}

                    <!-- 範囲内の各アイテムに選択範囲を描画 -->
                    {#each ids.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1) as itemId}
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

                        <!-- 選択範囲が実際に存在する場合のみ描画 -->
                        {#if startOff !== endOff}
                            {@const rect = calculateSelectionPixelRange(itemId, startOff, endOff, sel.isReversed)}
                            {#if rect}
                                {@const isPageTitle = itemId === 'page-title'}
                                <div
                                    class="selection selection-multi-item"
                                    class:page-title-selection={isPageTitle}
                                    class:selection-reversed={sel.isReversed && itemId === sel.startItemId}
                                    class:selection-forward={!sel.isReversed && itemId === sel.endItemId}
                                    style="position:absolute; left:{rect.left}px; top:{rect.top}px; width:{rect.width}px; height:{isPageTitle?'1.5em':rect.height}px; pointer-events:none;"
                                ></div>
                            {/if}
                        {/if}
                    {/each}
                {/if}
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
    visibility: visible !important;
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
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.3); /* カーソルの視認性向上 */
    border-radius: 1px; /* 微妙に角を丸くする */
}

.page-title-cursor {
    width: 3px;
}

.cursor.active {
    /* アニメーションはJS制御のvisibilityで同期 */
    pointer-events: none !important;
}

.selection {
    position: absolute;
    background-color: rgba(0, 120, 215, 0.25); /* コントラスト向上 */
    pointer-events: none !important;
    will-change: transform;
    border-radius: 2px; /* 角を少し丸くして視認性向上 */
    box-shadow: 0 0 0 1px rgba(0, 120, 215, 0.1); /* 微妙な影を追加 */
    transition: background-color 0.1s ease; /* スムーズな色変更 */
}

.selection-reversed {
    border-left: 2px solid rgba(0, 120, 215, 0.7); /* 太く、より目立つ境界線 */
}

.selection-forward {
    border-right: 2px solid rgba(0, 120, 215, 0.7); /* 正方向選択の視覚的区別 */
}

.page-title-selection {
    background-color: rgba(0, 120, 215, 0.2);
}

/* 複数アイテム選択時の連続性を強調 */
.selection-multi-item {
    border-left: none;
    border-right: none;
}

/* 矩形選択（ボックス選択）のスタイル */
.selection-box {
    background-color: rgba(0, 120, 215, 0.2);
    border: 1px dashed rgba(0, 120, 215, 0.7); /* 境界線の色を濃くして視認性向上 */
    box-shadow: 0 0 3px rgba(0, 120, 215, 0.3); /* 微妙な影を追加 */
    animation: box-selection-pulse 2s infinite ease-in-out; /* パルスアニメーション */
}

/* 矩形選択のパルスアニメーション */
@keyframes box-selection-pulse {
    0% {
        background-color: rgba(0, 120, 215, 0.15);
        border-color: rgba(0, 120, 215, 0.6);
    }
    50% {
        background-color: rgba(0, 120, 215, 0.25);
        border-color: rgba(0, 120, 215, 0.8);
    }
    100% {
        background-color: rgba(0, 120, 215, 0.15);
        border-color: rgba(0, 120, 215, 0.6);
    }
}

/* 矩形選択の開始位置と終了位置のマーカー */
.selection-box-marker {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    z-index: 201;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
}

/* 開始位置マーカー */
.selection-box-start-marker {
    background-color: #0078d7;
    border: 1px solid white;
    animation: marker-pulse 2s infinite ease-in-out;
}

/* 終了位置マーカー */
.selection-box-end-marker {
    background-color: #ff4081;
    border: 1px solid white;
    animation: marker-pulse 2s infinite ease-in-out reverse;
}

/* マーカーのパルスアニメーション */
@keyframes marker-pulse {
    0% {
        transform: scale(0.8);
        opacity: 0.7;
    }
    50% {
        transform: scale(1.2);
        opacity: 1;
    }
    100% {
        transform: scale(0.8);
        opacity: 0.7;
    }
}

/* 矩形選択の最初と最後の行のスタイル */
.selection-box-first {
    border-top: 2px solid rgba(0, 120, 215, 0.9);
}

.selection-box-last {
    border-bottom: 2px solid rgba(0, 120, 215, 0.9);
}

/* 矩形選択の開始アイテムと終了アイテムのスタイル */
.selection-box-start {
    border-left: 2px solid rgba(0, 120, 215, 0.9);
}

.selection-box-end {
    border-right: 2px solid rgba(0, 120, 215, 0.9);
}

/* 矩形選択の更新時のスタイル */
.selection-box-updating {
    animation: box-selection-update 0.3s ease-out;
}

@keyframes box-selection-update {
    0% {
        background-color: rgba(0, 120, 215, 0.4);
        border-color: rgba(0, 120, 215, 1);
    }
    100% {
        background-color: rgba(0, 120, 215, 0.2);
        border-color: rgba(0, 120, 215, 0.7);
    }
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

.debug-button {
    position: fixed;
    bottom: 10px;
    left: 10px;
    width: 30px;
    height: 30px;
    background-color: #333;
    color: #fff;
    border: none;
    border-radius: 50%;
    font-weight: bold;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.2s, background-color 0.2s;
    z-index: 1000;
    pointer-events: auto !important;
}

.debug-button:hover {
    opacity: 0.8;
}

.debug-button.active {
    background-color: #f00;
    opacity: 0.8;
}
</style>