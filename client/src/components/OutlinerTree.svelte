<script lang="ts">
import { goto } from "$app/navigation";
import { Tree } from "fluid-framework";
import {
    onDestroy,
    onMount,
} from "svelte";
import { getLogger } from "../lib/logger";
import {
    Item,
    Items,
} from "../schema/app-schema";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
import { fluidStore } from "../stores/fluidStore.svelte";
import type { DisplayItem } from "../stores/OutlinerViewModel";
import { OutlinerViewModel } from "../stores/OutlinerViewModel";
import { TreeSubscriber } from "../stores/TreeSubscriber";
import EditorOverlay from "./EditorOverlay.svelte";
import OutlinerItem from "./OutlinerItem.svelte";

const logger = getLogger();

/**
 * 【重要な実装メモ】
 * このコンポーネントではFluid FrameworkとSvelteの「マジカルな連携」を利用しています。
 * 特にタイトル編集では、SvelteのUI (bind:value) が直接Fluidオブジェクト (pageItem.text) に
 * バインドされています。これにより中間変数やTreeSubscriberなしで双方向バインディングが実現されています。
 *
 * この方法が機能する理由：
 * 1. Fluid Frameworkのオブジェクトはプロキシベースでプロパティ変更を検知
 * 2. Svelteの双方向バインディングがプロパティへの書き込みを処理
 * 3. Fluidが自動的に変更を分散データモデルに同期
 *
 * 注意: この連携が壊れた場合は、明示的なTreeSubscriberと更新関数の使用に戻すことを検討してください
 */

interface Props {
    pageItem: Item; // ページとして表示する Item
    projectName: string;
    pageName: string;
    isReadOnly?: boolean;
    onEdit?: () => void;
}

let { pageItem, projectName, pageName, isReadOnly = false, onEdit }: Props = $props();

let currentUser = $derived(fluidStore.currentUser?.id ?? 'anonymous');

// ビューストアを作成
const viewModel = new OutlinerViewModel();

// コンテナ要素への参照
let containerRef: HTMLDivElement;


let itemHeights = $state<number[]>([]);
let itemPositions = $state<number[]>([]);

// ドラッグ選択関連の状態
let isDragging = $state(false);
let dragStartItemId = $state<string | null>(null);
let dragStartOffset = $state(0);
let dragCurrentItemId = $state<string | null>(null);
let dragCurrentOffset = $state(0);

const displayItems = new TreeSubscriber<Items, DisplayItem[]>(
    pageItem.items as Items,
    "treeChanged",
    () => {
        console.log("OutlinerTree: displayItems transformer called");
        console.log("OutlinerTree: pageItem exists:", !!pageItem);
        console.log("OutlinerTree: pageItem.items exists:", !!pageItem.items);
        console.log("OutlinerTree: pageItem.items length:", (pageItem.items as any)?.length || 0);

        // 子アイテムの詳細をログ出力（YTree対応）
        const itemsList: any = (pageItem as any)?.items;
        if (itemsList && typeof itemsList.length === "number" && itemsList.length > 0) {
            for (let i = 0; i < itemsList.length; i++) {
                const it = itemsList.at ? itemsList.at(i) : (itemsList as any)[i];
                if (!it) continue;
                const txt = (it.text as any)?.toString?.() ?? String((it as any).text ?? "");
                const childLen = (it.items as any)?.length ?? 0;
                console.log(`OutlinerTree: Item ${i}: text="${txt}", hasChildren=${childLen > 0}, childrenCount=${childLen}`);
                if (childLen > 0) {
                    for (let j = 0; j < childLen; j++) {
                        const ch = (it.items as any).at ? (it.items as any).at(j) : (it.items as any)[j];
                        const ctxt = (ch?.text as any)?.toString?.() ?? String(ch?.text ?? "");
                        console.log(`OutlinerTree: Child ${j}: text="${ctxt}"`);
                    }
                }
            }
        }

        viewModel.updateFromModel(pageItem);
        const visibleItems = viewModel.getVisibleItems();
        console.log("OutlinerTree: visibleItems length:", visibleItems.length);

        // 表示アイテムの詳細をログ出力
        visibleItems.forEach((item, index) => {
            console.log(`OutlinerTree: DisplayItem ${index}: text="${item.model.text}", depth=${item.depth}`);
        });

        return visibleItems;
    },
);

// アイテムの高さが変更されたときに位置を再計算
function updateItemPositions() {
    let currentTop = 8; // 最初のアイテムの上部マージン
    itemPositions = itemHeights.map((height) => {
        const position = currentTop;
        // 最小高さ36pxを考慮
        const effectiveHeight = Math.max(height || 28, 28);
        // ページタイトルの後は24px、それ以降は36pxの間隔
        currentTop += effectiveHeight;
        return position;
    });

    // デバッグ用のログ
    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log("Heights:", $state.snapshot(itemHeights));
        console.log("Positions:", $state.snapshot(itemPositions));
    }
}

// アイテムの高さが変更されたときのハンドラ
function handleItemResize(event: CustomEvent) {
    const { index, height } = event.detail;
    if (typeof index === 'number' && typeof height === 'number') {
        // 高さが実際に変更され、かつ0より大きい場合のみ更新
        if (itemHeights[index] !== height && height > 0) {
            itemHeights[index] = height;
            updateItemPositions();

            // デバッグ用のログ
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Item ${index} height changed to ${height}px`);
            }
        }
    }
}

onMount(() => {
    const client = fluidStore.fluidClient;
    if (client?.currentUser) {
        currentUser = client.currentUser.id;
    }

    // onEdit コールバックをストアに設定
    editorOverlayStore.setOnEditCallback(handleEdit);

    // 初期状態でアイテムの高さを初期化
    itemHeights = new Array(displayItems.current.length).fill(0);

    // 各アイテムの初期高さを取得して設定
    requestAnimationFrame(() => {
        const items = document.querySelectorAll('.item-container');
        items.forEach((item, index) => {
            const height = item.getBoundingClientRect().height;
            itemHeights[index] = height;
        });
        updateItemPositions();
    });
});

// displayItemsが変更されたときにitemHeightsを更新
$effect(() => {
    const itemCount = displayItems.current.length;

    // 表示順序を EditorOverlayStore に通知（DOM依存の範囲列挙を排除）
    try {
        const ids = displayItems.current.map(d => d.model.id);
        editorOverlayStore.setVisibleItemIds(ids);
    } catch (e) {
        console.warn("Failed to set visibleItemIds:", e);
    }

    if (itemHeights.length !== itemCount) {
        // 既存のアイテムの高さを保持しつつ、新しい配列を作成
        const newHeights = new Array(itemCount).fill(28); // デフォルト値として28pxを設定
        itemHeights.forEach((height, index) => {
            if (index < itemCount) {
                newHeights[index] = height || 28; // 0の場合は28pxを使用
            }
        });
        itemHeights = newHeights;

        // DOMの更新を待ってから実際の高さを取得
        requestAnimationFrame(() => {
            const items = document.querySelectorAll('.item-container');
            items.forEach((item, index) => {
                const height = item.getBoundingClientRect().height;
                if (height > 0) {  // 実際の高さが取得できた場合のみ更新
                    itemHeights[index] = height;
                }
            });
            updateItemPositions();
        });
    }
});

onDestroy(() => {
    // onEdit コールバックをクリア
    editorOverlayStore.setOnEditCallback(null);

    // リソースを解放
    viewModel.dispose();
});

function handleAddItem() {
    const list: any = (pageItem as any)?.items;
    if (pageItem && !isReadOnly && list && typeof list.addNode === "function") {
        // 末尾にアイテム追加（YTree版）
        list.addNode(currentUser);
    }
}

// 最下部のアイテム編集中に空の兄弟アイテムを追加
function handleEdit() {
    // 外部のonEditがあれば呼び出し
    if (onEdit) onEdit();

    // 表示アイテムの最後を取得
    const items = displayItems.current;
    if (items.length === 0) return;
    const last = items[items.length - 1];
    const activeId = editorOverlayStore.getActiveItem();
    if (!activeId || activeId !== last.model.id) return;

    // 最下部アイテムが空でない場合のみ追加（Y.Text対応）
    const lastText = (last.model.original.text as any)?.toString?.() ?? String((last.model.original as any).text ?? "");
    if (lastText.trim().length === 0) return;

    const parent = Tree.parent(last.model.original);
    if (parent && Tree.is(parent, Items)) {
        const idx = parent.indexOf(last.model.original);
        parent.addNode(currentUser, idx + 1);
    } else if (pageItem.items && Tree.is(pageItem.items, Items)) {
        const idx = pageItem.items.indexOf(last.model.original);
        pageItem.items.addNode(currentUser, idx + 1);
    }
}

function handleToggleCollapse(event: CustomEvent) {
    const { itemId } = event.detail;

    // 折りたたみ状態を変更
    viewModel.toggleCollapsed(itemId);
}

import { Cursor } from "../lib/Cursor";

function handleIndent(event: CustomEvent) {
    if (event.detail.itemId === "page-title") return;
    const { itemId } = event.detail;
    const vm = viewModel.getViewModel(itemId);
    if (!vm) return;
    const cursor = new Cursor("tree-indent", { itemId, offset: 0, isActive: false, userId: "local" });
    try {
        cursor.indent();
        logger.info("Indented via Cursor.indent()");
    } catch (error) {
        console.error("Failed to indent item (Cursor):", error);
    }
}

function handleUnindent(event: CustomEvent) {
    if (event.detail.itemId === "page-title") return;
    const { itemId } = event.detail;
    const vm = viewModel.getViewModel(itemId);
    if (!vm) return;
    const cursor = new Cursor("tree-unindent", { itemId, offset: 0, isActive: false, userId: "local" });
    try {
        cursor.outdent();
        logger.info("Unindented via Cursor.outdent()");
    } catch (error) {
        console.error("Failed to unindent item (Cursor):", error);
    }
}

// デバッグモードを有効化（テスト環境でのみ）
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'test') {
    (window as any).DEBUG_MODE = true;
}

// アイテム間のナビゲーション処理
function handleNavigateToItem(event: CustomEvent) {
    // Shift選択対応のため shiftKey と direction も取得
    const { direction, cursorScreenX, fromItemId, toItemId, shiftKey } = event.detail;
    // Shiftなしの移動では既存の選択をクリア（非複数選択へ）
    if (!shiftKey) {
        editorOverlayStore.clearSelections();
    }

    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(
            `Navigation event received: direction=${direction}, fromItemId=${fromItemId}, toItemId=${toItemId}, cursorScreenX=${cursorScreenX}`,
        );
    }

    // toItemIdが指定されている場合は、そのアイテムに直接フォーカスする
    if (toItemId) {
        // 上下方向の移動の場合、カーソル位置を適切に設定
        if (direction === "up") {
            // 前のアイテムの最後の行に移動
            focusItemWithPosition(toItemId, Number.MAX_SAFE_INTEGER, shiftKey, direction);
            return;
        } else if (direction === "down") {
            // 次のアイテムの最初の行に移動
            focusItemWithPosition(toItemId, 0, shiftKey, direction);
            return;
        } else if (direction === "left" || direction === "right") {
            // 左右方向の移動
            focusItemWithPosition(toItemId, direction === "left" ? Number.MAX_SAFE_INTEGER : 0, shiftKey, direction);
            return;
        } else {
            // directionが指定されていない場合（エイリアスパスのクリックなど）
            focusItemWithPosition(toItemId, 0, shiftKey, undefined);
            return;
        }
    }

    // 左右方向の処理
    if (direction === "left") {
        let currentIndex = displayItems.current.findIndex(item => item.model.id === fromItemId);
        if (currentIndex > 0) {
            // 前のアイテムに移動
            const targetItemId = displayItems.current[currentIndex - 1].model.id;
            focusItemWithPosition(targetItemId, Number.MAX_SAFE_INTEGER, shiftKey, 'left');
        }
        else {
            // 最初のアイテムの場合は現在のアイテムにとどまる
            focusItemWithPosition(fromItemId, 0, shiftKey, 'left');
        }
        return;
    }
    else if (direction === "right") {
        let currentIndex = displayItems.current.findIndex(item => item.model.id === fromItemId);
        if (currentIndex >= 0 && currentIndex < displayItems.current.length - 1) {
            // 次のアイテムに移動
            const targetItemId = displayItems.current[currentIndex + 1].model.id;
            focusItemWithPosition(targetItemId, 0, shiftKey, 'right');
            return;
        }
        // 最後のアイテムなら何もしない（末尾まで移動）
        focusItemWithPosition(fromItemId, Number.MAX_SAFE_INTEGER, shiftKey, 'right');
        return;
    }

    // 上下方向の処理
    let currentIndex = displayItems.current.findIndex(item => item.model.id === fromItemId);

    // Shift+Down による複数選択: storeのselectionsから最初の範囲を取得して終端を更新
    if (shiftKey && direction === "down") {
        const selectionRanges = Object.values(editorOverlayStore.selections);
        if (selectionRanges.length === 0) return;
        const { startItemId, startOffset } = selectionRanges[0];
        const targetItemId = displayItems.current[currentIndex + 1]?.model.id;
        if (!targetItemId) return;
        const endEl = document.querySelector(`[data-item-id="${targetItemId}"] .item-text`) as HTMLElement;
        const endLen = endEl?.textContent?.length || 0;
        editorOverlayStore.setSelection({
            startItemId,
            endItemId: targetItemId,
            startOffset,
            endOffset: endLen,
            userId: 'local',
            isReversed: false
        });
        return;
    }
    // Shift+Up による複数選択: storeのselectionsから最初の範囲を取得して始端を更新
    if (shiftKey && direction === "up") {
        const selectionRanges = Object.values(editorOverlayStore.selections);
        if (selectionRanges.length === 0) return;
        const { endItemId, endOffset } = selectionRanges[0];
        const targetItemId = displayItems.current[currentIndex - 1]?.model.id;
        if (!targetItemId) return;
        const startEl = document.querySelector(`[data-item-id="${targetItemId}"] .item-text`) as HTMLElement;
        const startLen = startEl?.textContent?.length || 0;
        editorOverlayStore.setSelection({
            startItemId: targetItemId,
            endItemId,
            startOffset: startLen,
            endOffset,
            userId: 'local',
            isReversed: true
        });
        return;
    }

    // 最初のアイテムで上に移動しようとした場合
    if (currentIndex === 0 && direction === "up") {
        focusItemWithPosition(fromItemId, 0, shiftKey, 'up');
        return;
    }

    // 最後のアイテムから下へ移動しようとした場合
    if (direction === "down" && currentIndex === displayItems.current.length - 1) {
        focusItemWithPosition(fromItemId, Number.MAX_SAFE_INTEGER, shiftKey, 'down');
        return;
    }

    // 通常のアイテム間ナビゲーション
    let targetIndex = -1;
    if (direction === "up") {
        targetIndex = currentIndex - 1;
    }
    else if (direction === "down") {
        targetIndex = currentIndex + 1;
    }

    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(
            `Navigation calculation: currentIndex=${currentIndex}, targetIndex=${targetIndex}, items count=${displayItems.current.length}`,
        );
    }

    // ターゲットが通常のアイテムの範囲内にある場合
    if (targetIndex >= 0 && targetIndex < displayItems.current.length) {
        const targetItemId = displayItems.current[targetIndex].model.id;
        focusItemWithPosition(targetItemId, cursorScreenX, shiftKey, direction);
    }
}

// 指定したアイテムにフォーカスし、カーソル位置を設定する
function focusItemWithPosition(itemId: string, cursorScreenX?: number, shiftKey = false, direction?: string) {
    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(`Focusing item ${itemId} with cursor X: ${cursorScreenX}px, shift=${shiftKey}, direction=${direction}`);
    }

    // ターゲットアイテム要素を取得
    const item = document.querySelector(`[data-item-id="${itemId}"]`);
    if (!item) {
        console.error(`Could not find item with ID: ${itemId}`);
        return;
    }

    // 現在フォーカスされているアイテムがある場合は編集を終了
    const activeItem = editorOverlayStore.getActiveItem();

    // アクティブなアイテムから新しいアイテムへの移動を順に処理
    const focusNewItem = () => {
        try {
            // 特殊なカーソル位置値を処理
            let cursorXValue = cursorScreenX;

            // カスタムイベントを作成してアイテムに発火
            const event = new CustomEvent("focus-item", {
                detail: {
                    cursorScreenX: cursorXValue,
                    shiftKey,
                    direction
                },
                bubbles: false,
                cancelable: true,
            });

            // イベントをディスパッチ
            item.dispatchEvent(event);

            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Dispatched focus-item event to ${itemId} with X: ${cursorXValue}px, shift=${shiftKey}`);
            }
        }
        catch (error) {
            console.error(`Error dispatching focus-item event to ${itemId}:`, error);
        }
    };

    if (activeItem && activeItem !== itemId) {
        // 現在編集中のアイテムがあり、それが対象と異なる場合
        const activeElement = document.querySelector(`[data-item-id="${activeItem}"]`);
        if (activeElement) {
            // 現在のアイテムで編集を終了
            const finishEditEvent = new CustomEvent("finish-edit");
            activeElement.dispatchEvent(finishEditEvent);

            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Sent finish-edit event to active item ${activeItem}`);
            }

            // 確実に処理の順序を保つため、少し遅延させてから新しいアイテムにフォーカス
            setTimeout(focusNewItem, 10);
        }
        else {
            // アクティブ要素が見つからない場合はすぐにフォーカス
            focusNewItem();
        }
    }
    else {
        // アクティブなアイテムがない、または同じアイテムなら直接フォーカス
        focusNewItem();
    }
}


// 同じ階層に新しいアイテムを追加するハンドラ
function handleAddSibling(event: CustomEvent) {
    const { itemId } = event.detail;
    const currentIndex = displayItems.current.findIndex(item => item.model.id === itemId);

    if (currentIndex >= 0) {
        const currentItem = displayItems.current[currentIndex];
        const parent = Tree.parent(currentItem.model.original);

        if (parent && Tree.is(parent, Items)) {
            // 親アイテムが存在する場合、現在のアイテムの直後に追加
            const itemIndex = parent.indexOf(currentItem.model.original);
            parent.addNode(currentUser, itemIndex + 1);
        } else {
            // ルートレベルのアイテムとして追加
            const items = pageItem.items;
            if (items && Tree.is(items, Items)) {
                const itemIndex = items.indexOf(currentItem.model.original);
                items.addNode(currentUser, itemIndex + 1);
            }
        }
    }
}


// 複数行ペースト時に新規アイテムを追加
function handlePasteMultiItem(event: CustomEvent) {
    const { lines, selections, activeItemId } = event.detail;

    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`handlePasteMultiItem called with lines:`, lines);
        console.log(`Selections:`, selections);
        console.log(`Active item ID: ${activeItemId}`);
    }

    // テスト用にグローバル変数に設定
    if (typeof window !== 'undefined') {
        (window as any).lastPasteLines = lines;
        (window as any).lastPasteSelections = selections;
        (window as any).lastPasteActiveItemId = activeItemId;
    }

    // 選択範囲がある場合は、選択範囲を削除してからペースト
    if (selections && selections.length > 0) {
        // 複数アイテムにまたがる選択範囲がある場合
        const multiItemSelection = selections.find((sel: any) => sel.startItemId !== sel.endItemId);

        if (multiItemSelection) {
            // 複数アイテムにまたがる選択範囲を処理
            handleMultiItemSelectionPaste(multiItemSelection, lines);
            return;
        }

        // 単一アイテム内の選択範囲を処理
        const singleItemSelection = selections[0];
        if (singleItemSelection) {
            handleSingleItemSelectionPaste(singleItemSelection, lines);
            return;
        }
    }

    // 選択範囲がない場合は、アクティブアイテムにペースト
    // 最初の選択アイテムをベースとする
    const firstItemId = activeItemId;
    const itemIndex = displayItems.current.findIndex(d => d.model.id === firstItemId);

    // アクティブアイテムが見つからない場合は最初のアイテムを使用
    if (itemIndex < 0) {
        if (displayItems.current.length > 0) {
            const firstAvailableItemId = displayItems.current[0].model.id;
            const firstAvailableIndex = 0;

            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Active item not found, using first available item: ${firstAvailableItemId}`);
            }

            // 最初のアイテムにペースト
            const items = pageItem.items as Items;
            const baseOriginal = displayItems.current[firstAvailableIndex].model.original;
            baseOriginal.text = lines[0] || '';

            // 残りの行を新しいアイテムとして追加
            for (let i = 1; i < lines.length; i++) {
                const newIndex = firstAvailableIndex + i;
                items.addNode(currentUser, newIndex);
                // 追加直後のアイテムを配列インデックスで取得しテキスト設定
                const newItem = items[newIndex];
                if (newItem) {
                    newItem.text = lines[i];
                }
            }

            return;
        }

        return;
    }

    const items = pageItem.items as Items;

    // 既存の選択アイテムを更新
    const baseOriginal = displayItems.current[itemIndex].model.original;
    baseOriginal.text = lines[0] || '';

    // 残りの行でアイテムを追加
    for (let i = 1; i < lines.length; i++) {
        const newIndex = itemIndex + i;
        items.addNode(currentUser, newIndex);
        // 追加直後のアイテムを配列インデックスで取得しテキスト設定
        const newItem = items[newIndex];
        if (newItem) {
            newItem.text = lines[i];
        }
    }
}

// 複数アイテムにまたがる選択範囲にペーストする
function handleMultiItemSelectionPaste(selection: any, lines: string[]) {
    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`handleMultiItemSelectionPaste called with selection:`, selection);
        console.log(`Lines to paste:`, lines);
    }

    // 選択範囲の開始と終了アイテムを取得
    const startItemId = selection.startItemId;
    const endItemId = selection.endItemId;

    // アイテムのインデックスを取得
    const startIndex = displayItems.current.findIndex(d => d.model.id === startItemId);
    const endIndex = displayItems.current.findIndex(d => d.model.id === endItemId);

    if (startIndex < 0 || endIndex < 0) {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Start or end item not found: startIndex=${startIndex}, endIndex=${endIndex}`);
        }
        return;
    }

    // 選択範囲の方向を考慮
    const isReversed = selection.isReversed || false;
    const actualStartIndex = Math.min(startIndex, endIndex);
    const actualEndIndex = Math.max(startIndex, endIndex);

    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Selection direction: isReversed=${isReversed}`);
        console.log(`Actual indices: start=${actualStartIndex}, end=${actualEndIndex}`);
    }

    const items = pageItem.items as Items;

    // 選択範囲内のアイテムを削除（後ろから削除）
    for (let i = actualEndIndex; i >= actualStartIndex; i--) {
        if (i === actualStartIndex) {
            // 開始アイテムは削除せず、テキストを更新
            const startItem = displayItems.current[i].model.original;
            startItem.text = lines[0] || '';

            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Updated first item text to: "${lines[0] || ''}"`);
            }
        } else {
            // それ以外のアイテムは削除
            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Removing item at index ${i}`);
            }
            items.removeAt(i);
        }
    }

    // 残りの行を新しいアイテムとして追加
    for (let i = 1; i < lines.length; i++) {
        const newIndex = actualStartIndex + i;
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Adding new item at index ${newIndex} with text: "${lines[i]}"`);
        }
        items.addNode(currentUser, newIndex);
        // 追加直後のアイテムを配列インデックスで取得しテキスト設定
        const newItem = items[newIndex];
        if (newItem) {
            newItem.text = lines[i];
        }
    }

    // カーソル位置を更新
    const newCursorItemId = displayItems.current[actualStartIndex]?.model.id;
    if (newCursorItemId) {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Setting cursor to item ${newCursorItemId} at offset ${(lines[0] || '').length}`);
        }

        editorOverlayStore.setCursor({
            itemId: newCursorItemId,
            offset: (lines[0] || '').length,
            isActive: true,
            userId: 'local'
        });

        // アクティブアイテムを設定
        editorOverlayStore.setActiveItem(newCursorItemId);

        // 選択範囲をクリア
        editorOverlayStore.clearSelections();
    } else {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Could not find cursor item at index ${actualStartIndex}`);
        }
    }
}

// 単一アイテム内の選択範囲にペーストする
function handleSingleItemSelectionPaste(selection: any, lines: string[]) {
    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`handleSingleItemSelectionPaste called with selection:`, selection);
        console.log(`Lines to paste:`, lines);
    }

    const itemId = selection.startItemId;
    const startOffset = Math.min(selection.startOffset, selection.endOffset);
    const endOffset = Math.max(selection.startOffset, selection.endOffset);

    // アイテムのインデックスを取得
    const itemIndex = displayItems.current.findIndex(d => d.model.id === itemId);
    if (itemIndex < 0) {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Item not found: itemId=${itemId}, itemIndex=${itemIndex}`);
        }
        return;
    }

    const items = pageItem.items as Items;
    const item = displayItems.current[itemIndex].model.original;
    const text = item.text || '';

    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Original text: "${text}"`);
        console.log(`Selection range: start=${startOffset}, end=${endOffset}`);
    }

    if (lines.length === 1) {
        // 単一行のペーストの場合は、選択範囲を置き換え
        const newText = text.substring(0, startOffset) + lines[0] + text.substring(endOffset);
        item.text = newText;

        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Updated text to: "${newText}"`);
        }

        // カーソル位置を更新
        editorOverlayStore.setCursor({
            itemId,
            offset: startOffset + lines[0].length,
            isActive: true,
            userId: 'local'
        });

        // 選択範囲をクリア
        editorOverlayStore.clearSelections();
    } else {
        // 複数行のペーストの場合
        // 最初の行は現在のアイテムの選択範囲を置き換え
        const newFirstText = text.substring(0, startOffset) + lines[0];
        item.text = newFirstText;

        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Updated first item text to: "${newFirstText}"`);
        }

        // 残りの行を新しいアイテムとして追加
        for (let i = 1; i < lines.length; i++) {
            const newIndex = itemIndex + i;

            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Adding new item at index ${newIndex}`);
            }

            items.addNode(currentUser, newIndex);
            // 追加直後のアイテムを配列インデックスで取得しテキスト設定
            const newItem = items[newIndex];
            if (newItem) {
                if (i === lines.length - 1) {
                    // 最後の行は、選択範囲の後ろのテキストを追加
                    const lastItemText = lines[i] + text.substring(endOffset);
                    newItem.text = lastItemText;

                    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                        console.log(`Last item text set to: "${lastItemText}"`);
                    }
                } else {
                    newItem.text = lines[i];

                    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                        console.log(`Item ${i} text set to: "${lines[i]}"`);
                    }
                }
            }
        }

        // カーソル位置を更新（最後のアイテムの末尾）
        const lastItemIndex = itemIndex + lines.length - 1;
        const lastItemId = displayItems.current[lastItemIndex]?.model.id;
        if (lastItemId) {
            const lastLine = lines[lines.length - 1];
            const newOffset = lastLine.length;

            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Setting cursor to last item ${lastItemId} at offset ${newOffset}`);
            }

            editorOverlayStore.setCursor({
                itemId: lastItemId,
                offset: newOffset,
                isActive: true,
                userId: 'local'
            });

            // アクティブアイテムを設定
            editorOverlayStore.setActiveItem(lastItemId);

            // 選択範囲をクリア
            editorOverlayStore.clearSelections();
        } else {
            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Could not find last item at index ${lastItemIndex}`);
            }
        }
    }
}

// ツリー全体のマウスダウンイベントハンドラ
function handleTreeMouseDown(event: MouseEvent) {
    // 右クリックは無視
    if (event.button !== 0) return;

    // 既に処理されたイベントは無視
    if (event.defaultPrevented) return;

    // アイテム内のクリックは無視（OutlinerItemで処理される）
    const target = event.target as HTMLElement;
    if (target.closest('.outliner-item')) return;

    // 選択範囲をクリア
    editorOverlayStore.clearSelections();
}

// ツリー全体のマウスアップイベントハンドラ
function handleTreeMouseUp() {
    // ドラッグ中でない場合は無視
    if (!isDragging) return;

    // ドラッグ終了
    isDragging = false;

    // ドラッグ情報をリセット
    dragStartItemId = null;
    dragCurrentItemId = null;
}

// アイテムのドラッグ開始イベントハンドラ
function handleItemDragStart(event: CustomEvent) {
    const { itemId, offset } = event.detail;

    // ドラッグ開始情報を保存
    isDragging = true;
    dragStartItemId = itemId;
    dragStartOffset = offset;
    dragCurrentItemId = itemId;
    dragCurrentOffset = offset;

    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(`Drag start: itemId=${itemId}, offset=${offset}`);
    }
}

// アイテムのドラッグ中イベントハンドラ
function handleItemDrag(event: CustomEvent) {
    const { itemId, offset } = event.detail;

    // ドラッグ中でない場合は無視
    if (!isDragging || !dragStartItemId) return;

    // 現在のドラッグ位置を更新
    dragCurrentItemId = itemId;
    dragCurrentOffset = offset;

    // 選択範囲を更新
    updateDragSelection();

    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(`Dragging: itemId=${itemId}, offset=${offset}`);
    }
}

// ドラッグ選択範囲を更新する
function updateDragSelection() {
    if (!dragStartItemId || !dragCurrentItemId) return;

    // 開始アイテムと現在のアイテムのインデックスを取得
    const startIndex = displayItems.current.findIndex(item => item.model.id === dragStartItemId);
    const currentIndex = displayItems.current.findIndex(item => item.model.id === dragCurrentItemId);

    if (startIndex === -1 || currentIndex === -1) return;

    // 選択方向を決定
    const isReversed = startIndex > currentIndex ||
                      (startIndex === currentIndex && dragStartOffset > dragCurrentOffset);

    // 選択範囲の開始と終了を決定
    const startItemId = isReversed ? dragCurrentItemId : dragStartItemId;
    const startOffset = isReversed ? dragCurrentOffset : dragStartOffset;
    const endItemId = isReversed ? dragStartItemId : dragCurrentItemId;
    const endOffset = isReversed ? dragStartOffset : dragCurrentOffset;

    // 選択範囲を設定
    editorOverlayStore.setSelection({
        startItemId,
        startOffset,
        endItemId,
        endOffset,
        userId: 'local',
        isReversed
    });

    // カーソル位置を更新
    editorOverlayStore.setCursor({
        itemId: dragCurrentItemId,
        offset: dragCurrentOffset,
        isActive: true,
        userId: 'local'
    });

    // アクティブアイテムを設定
    editorOverlayStore.setActiveItem(dragCurrentItemId);
}

// アイテムのドロップイベントハンドラ
function handleItemDrop(event: CustomEvent) {
    const { targetItemId, position, text, selection, sourceItemId } = event.detail;

    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(`Drop event: targetItemId=${targetItemId}, position=${position}, sourceItemId=${sourceItemId}`);
        console.log(`Text: "${text}"`);
        console.log(`Selection:`, selection);
    }

    // 選択範囲がある場合は、選択範囲を削除してからドロップ
    if (selection) {
        // 選択範囲の削除処理
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;

        // 単一アイテム内の選択範囲
        if (startItemId === endItemId) {
            handleSingleItemSelectionDrop(selection, targetItemId, position, text);
        } else {
            // 複数アイテムにまたがる選択範囲
            handleMultiItemSelectionDrop(selection, targetItemId, position, text);
        }
    } else if (sourceItemId) {
        // 単一アイテム全体のドラッグ＆ドロップ
        handleItemMoveDrop(sourceItemId, targetItemId, position);
    } else {
        // 外部からのテキストドロップ
        handleExternalTextDrop(targetItemId, position, text);
    }

    // ドラッグ状態をリセット
    isDragging = false;
    dragStartItemId = null;
    dragCurrentItemId = null;
}

// アイテムのドラッグ終了イベントハンドラ
function handleItemDragEnd(event: CustomEvent) {
    const { itemId } = event.detail;

    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(`Drag end: itemId=${itemId}`);
    }

    // ドラッグ状態をリセット
    isDragging = false;
    dragStartItemId = null;
    dragCurrentItemId = null;
}

// 単一アイテム内の選択範囲をドロップする
function handleSingleItemSelectionDrop(selection: any, targetItemId: string, position: string, text: string) {
    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`handleSingleItemSelectionDrop called with selection:`, selection);
        console.log(`Target: itemId=${targetItemId}, position=${position}`);
    }

    const sourceItemId = selection.startItemId;
    const startOffset = Math.min(selection.startOffset, selection.endOffset);
    const endOffset = Math.max(selection.startOffset, selection.endOffset);

    // ソースアイテムとターゲットアイテムのインデックスを取得
    const sourceIndex = displayItems.current.findIndex(d => d.model.id === sourceItemId);
    const targetIndex = displayItems.current.findIndex(d => d.model.id === targetItemId);

    if (sourceIndex < 0 || targetIndex < 0) {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Source or target item not found: sourceIndex=${sourceIndex}, targetIndex=${targetIndex}`);
        }
        return;
    }

    // ソースアイテムのテキストを取得
    const sourceItem = displayItems.current[sourceIndex].model.original;
    const sourceText = sourceItem.text || '';

    // ターゲットアイテムのテキストを取得
    const targetItem = displayItems.current[targetIndex].model.original;
    const targetText = targetItem.text || '';

    // 選択範囲のテキストを取得
    const selectedText = sourceText.substring(startOffset, endOffset);

    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Selected text: "${selectedText}"`);
    }

    // ソースアイテムから選択範囲を削除
    const newSourceText = sourceText.substring(0, startOffset) + sourceText.substring(endOffset);
    sourceItem.text = newSourceText;

    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Updated source text: "${newSourceText}"`);
    }

    // ターゲットアイテムに選択範囲を挿入
    if (position === 'top') {
        // アイテムの先頭に挿入
        targetItem.text = selectedText + targetText;
    } else if (position === 'bottom') {
        // アイテムの末尾に挿入
        targetItem.text = targetText + selectedText;
    } else if (position === 'middle') {
        // アイテムの中央に挿入（カーソル位置を計算）
        const middleOffset = Math.floor(targetText.length / 2);
        targetItem.text = targetText.substring(0, middleOffset) + selectedText + targetText.substring(middleOffset);
    }

    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Updated target text: "${targetItem.text}"`);
    }

    // カーソル位置を更新
    editorOverlayStore.setCursor({
        itemId: targetItemId,
        offset: position === 'top' ? selectedText.length :
                position === 'bottom' ? targetText.length + selectedText.length :
                Math.floor(targetText.length / 2) + selectedText.length,
        isActive: true,
        userId: 'local'
    });

    // アクティブアイテムを設定
    editorOverlayStore.setActiveItem(targetItemId);

    // 選択範囲をクリア
    editorOverlayStore.clearSelections();
}

// 複数アイテムにまたがる選択範囲をドロップする
function handleMultiItemSelectionDrop(selection: any, targetItemId: string, position: string, text: string) {
    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`handleMultiItemSelectionDrop called with selection:`, selection);
        console.log(`Target: itemId=${targetItemId}, position=${position}`);
    }

    // 選択範囲の開始と終了アイテムを取得
    const startItemId = selection.startItemId;
    const endItemId = selection.endItemId;

    // アイテムのインデックスを取得
    const startIndex = displayItems.current.findIndex(d => d.model.id === startItemId);
    const endIndex = displayItems.current.findIndex(d => d.model.id === endItemId);
    const targetIndex = displayItems.current.findIndex(d => d.model.id === targetItemId);

    if (startIndex < 0 || endIndex < 0 || targetIndex < 0) {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Start, end, or target item not found: startIndex=${startIndex}, endIndex=${endIndex}, targetIndex=${targetIndex}`);
        }
        return;
    }

    // 選択範囲の方向を考慮
    const isReversed = selection.isReversed || false;
    const actualStartIndex = Math.min(startIndex, endIndex);
    const actualEndIndex = Math.max(startIndex, endIndex);

    // 選択範囲内のテキストを取得
    const selectedText = text;

    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Selected text: "${selectedText}"`);
    }

    const items = pageItem.items as Items;

    // 選択範囲内のアイテムを削除（後ろから削除）
    for (let i = actualEndIndex; i >= actualStartIndex; i--) {
        if (i === actualStartIndex) {
            // 開始アイテムは削除せず、テキストを更新
            const startItem = displayItems.current[i].model.original;
            startItem.text = '';

            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Cleared first item text`);
            }
        } else {
            // それ以外のアイテムは削除
            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Removing item at index ${i}`);
            }
            items.removeAt(i);
        }
    }

    // ターゲットアイテムのテキストを取得
    const targetItem = displayItems.current[targetIndex].model.original;
    const targetText = targetItem.text || '';

    // 選択範囲のテキストを行に分割
    const lines = selectedText.split('\n');

    // ターゲットアイテムに選択範囲を挿入
    if (position === 'top') {
        // アイテムの先頭に挿入
        targetItem.text = lines[0] + targetText;

        // 残りの行を新しいアイテムとして追加
        for (let i = 1; i < lines.length; i++) {
            items.addNode(currentUser, targetIndex + i);
            const newItem = items[targetIndex + i];
            if (newItem) {
                newItem.text = lines[i];
            }
        }
    } else if (position === 'bottom') {
        // アイテムの末尾に挿入
        targetItem.text = targetText + lines[0];

        // 残りの行を新しいアイテムとして追加
        for (let i = 1; i < lines.length; i++) {
            items.addNode(currentUser, targetIndex + i);
            const newItem = items[targetIndex + i];
            if (newItem) {
                newItem.text = lines[i];
            }
        }
    } else if (position === 'middle') {
        // アイテムの中央に挿入（カーソル位置を計算）
        const middleOffset = Math.floor(targetText.length / 2);
        targetItem.text = targetText.substring(0, middleOffset) + lines[0] + targetText.substring(middleOffset);

        // 残りの行を新しいアイテムとして追加
        for (let i = 1; i < lines.length; i++) {
            items.addNode(currentUser, targetIndex + i);
            const newItem = items[targetIndex + i];
            if (newItem) {
                newItem.text = lines[i];
            }
        }
    }

    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Updated target text: "${targetItem.text}"`);
    }

    // カーソル位置を更新
    editorOverlayStore.setCursor({
        itemId: targetItemId,
        offset: position === 'top' ? lines[0].length :
                position === 'bottom' ? targetText.length + lines[0].length :
                Math.floor(targetText.length / 2) + lines[0].length,
        isActive: true,
        userId: 'local'
    });

    // アクティブアイテムを設定
    editorOverlayStore.setActiveItem(targetItemId);

    // 選択範囲をクリア
    editorOverlayStore.clearSelections();
}

// アイテム全体を移動する
function handleItemMoveDrop(sourceItemId: string, targetItemId: string, position: string) {
    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`handleItemMoveDrop called with sourceItemId=${sourceItemId}, targetItemId=${targetItemId}, position=${position}`);
    }

    // ソースアイテムとターゲットアイテムのインデックスを取得
    const sourceIndex = displayItems.current.findIndex(d => d.model.id === sourceItemId);
    const targetIndex = displayItems.current.findIndex(d => d.model.id === targetItemId);

    if (sourceIndex < 0 || targetIndex < 0) {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Source or target item not found: sourceIndex=${sourceIndex}, targetIndex=${targetIndex}`);
        }
        return;
    }

    // タイトル（先頭）へのドロップは no-op
    if (targetIndex === 0) {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Drop onto title (index 0) ignored`);
        }
        return;
    }

    // ソースアイテムとターゲットアイテムが同じ場合は何もしない
    if (sourceIndex === targetIndex) {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Source and target are the same item, no action needed`);
        }
        return;
    }

    const items = pageItem.items as Items;

    // ソースアイテムを取得
    const sourceItem = displayItems.current[sourceIndex].model.original;
    const sourceText: string = (sourceItem.text as any)?.toString?.() ?? String((sourceItem as any).text ?? "");

    // ターゲットの位置を計算
    let targetPosition = targetIndex;
    if (position === 'bottom' || position === 'middle') {
        // Yjs版では 'middle' も 'bottom' として扱い、対象の直後に移動させる
        targetPosition = targetIndex + 1;
    }

    // ソースアイテムがターゲットより前にある場合、ターゲット位置を調整
    if (sourceIndex < targetPosition) {
        targetPosition--;
    }

    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Moving item from index ${sourceIndex} to index ${targetPosition}`);
    }

    // アイテムを移動
    try {
        // ソースアイテムを削除
        items.removeAt(sourceIndex);

        // 新しい位置にアイテムを追加し、テキストを設定（Yjs）
        const inserted = items.addNode(currentUser, targetPosition);
        if (inserted) {
            inserted.updateText(sourceText);
        }

        // 既存カーソルと選択をクリアして単一アクティブに収束させる
        if (typeof editorOverlayStore.clearCursorAndSelection === 'function') {
            editorOverlayStore.clearCursorAndSelection('local', false, false);
        }
        // アクティブアイテムを設定
        editorOverlayStore.setActiveItem(inserted.id);
        // カーソル位置を更新（単一化）
        editorOverlayStore.setCursor({
            itemId: inserted.id,
            offset: 0,
            isActive: true,
            userId: 'local'
        });
        // 選択範囲をクリア
        editorOverlayStore.clearSelections();
    } catch (error) {
        console.error('Failed to move item:', error);
    }
}

// 外部からのテキストをドロップする
function handleExternalTextDrop(targetItemId: string, position: string, text: string) {
    // デバッグ情報
    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`handleExternalTextDrop called with targetItemId=${targetItemId}, position=${position}`);
        console.log(`Text: "${text}"`);
    }

    // ターゲットアイテムのインデックスを取得
    const targetIndex = displayItems.current.findIndex(d => d.model.id === targetItemId);

    if (targetIndex < 0) {
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Target item not found: targetIndex=${targetIndex}`);
        }
        return;
    }

    // ターゲットアイテムのテキストを取得
    const targetItem = displayItems.current[targetIndex].model.original;
    const targetText: string = (targetItem.text as any)?.toString?.() ?? String((targetItem as any).text ?? "");

    // テキストを行に分割
    const lines = text.split('\n');

    const items = pageItem.items as Items;

    // ターゲットアイテムにテキストを挿入
    if (position === 'top') {
        // アイテムの先頭に挿入
        targetItem.updateText(lines[0] + targetText);

        // 残りの行を新しいアイテムとして追加
        for (let i = 1; i < lines.length; i++) {
            const inserted = items.addNode(currentUser, targetIndex + i);
            inserted.updateText(lines[i]);
        }
    } else if (position === 'bottom' || position === 'middle') {
        // bottom/middle は末尾に挿入扱い
        targetItem.updateText(targetText + lines[0]);

        // 残りの行を新しいアイテムとして追加
        for (let i = 1; i < lines.length; i++) {
            const inserted = items.addNode(currentUser, targetIndex + i);
            inserted.updateText(lines[i]);
        }
    }

    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
        console.log(`Updated target text: "${targetItem.text}"`);
    }

    // カーソル位置を更新
    editorOverlayStore.setCursor({
        itemId: targetItemId,
        offset: position === 'top' ? lines[0].length :
                position === 'bottom' ? targetText.length + lines[0].length :
                Math.floor(targetText.length / 2) + lines[0].length,
        isActive: true,
        userId: 'local'
    });

    // アクティブアイテムを設定
    editorOverlayStore.setActiveItem(targetItemId);

    // 選択範囲をクリア
    editorOverlayStore.clearSelections();
}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="outliner" bind:this={containerRef} onmousedown={handleTreeMouseDown} onmouseup={handleTreeMouseUp} role="application">
    <div class="toolbar">
        <div class="actions">
            {#if !isReadOnly}
                <button onclick={handleAddItem}>アイテム追加</button>
            {/if}
            <button onclick={() => goto(`/${projectName}/${pageName}/diff`)}>
                History / Diff
            </button>
        </div>
    </div>

    <div class="tree-container" role="region" aria-label="アウトライナーツリー">
        <!-- フラット表示の各アイテム（絶対位置配置） -->
        {#each displayItems.current as display, index (display.model.id)}
            <div
                class="item-container"
                style="--item-depth: {display.depth}; top: {itemPositions[index] ?? 0}px"
                bind:clientHeight={itemHeights[index]}
            >
                <OutlinerItem
                    model={display.model}
                    depth={display.depth}
                    currentUser={currentUser}
                    isReadOnly={isReadOnly}
                    isCollapsed={viewModel.isCollapsed(display.model.id)}
                    hasChildren={viewModel.hasChildren(display.model.id)}
                    isPageTitle={index === 0}
                    {index}
                    on:toggle-collapse={handleToggleCollapse}
                    on:indent={handleIndent}
                    on:unindent={handleUnindent}
                    on:navigate-to-item={handleNavigateToItem}
                    on:resize={handleItemResize}
                    on:add-sibling={handleAddSibling}
                    on:drag-start={handleItemDragStart}
                    on:drag={handleItemDrag}
                    on:drop={handleItemDrop}
                    on:drag-end={handleItemDragEnd}
                />
            </div>
        {/each}

        {#if displayItems.current.length === 0 && !isReadOnly}
            <div class="empty-state">
                <p>
                    アイテムがありません。「アイテム追加」ボタンを押して始めましょう。
                </p>
            </div>
        {/if}

        <!-- エディタオーバーレイレイヤー -->
        <div class="overlay-container">
            <EditorOverlay on:paste-multi-item={handlePasteMultiItem} />
        </div>
    </div>
</div>

<style>
.outliner {
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 20px;
    height: calc(100vh - 40px); /* ブラウザの高さから余白を引いた値 */
    display: flex;
    flex-direction: column;
}

.toolbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 8px 16px;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0; /* ツールバーは縮まないように */
}

.actions {
    display: flex;
    gap: 8px;
}

.actions button {
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 14px;
}

.actions button:hover {
    background: #e8e8e8;
}

.tree-container {
    padding: 8px 16px;
    position: relative; /* 子要素の絶対位置の基準点 */
    min-height: 100px; /* 最小高さを設定 */
    flex: 1; /* 残りの空間を全て使用 */
    overflow-y: auto; /* スクロール可能に */
}

.item-container {
    position: absolute;
    left: calc(16px + max(0, var(--item-depth) - 1) * 24px);
    width: calc(100% - 32px - max(0, var(--item-depth) - 1) * 24px);
    min-height: 36px; /* 最小の高さを設定 */
    transition: left 0.2s ease, top 0.2s ease;
}

.empty-state {
    padding: 20px;
    text-align: center;
    color: #999;
}

.overlay-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none !important; /* クリックイベントを下のレイヤーに確実に透過 */
    z-index: 100;
    transform: none !important; /* 変形を防止 */
}
</style>
