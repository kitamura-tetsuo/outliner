<script lang="ts">
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
const { getActiveItem, reset, selections, setActiveItem, setSelection } = editorOverlayStore;

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
    isReadOnly?: boolean;
}

let { pageItem, isReadOnly = false }: Props = $props();

let currentUser = $derived(fluidStore.currentUser?.id ?? 'anonymous');

// ビューストアを作成
const viewModel = new OutlinerViewModel();

// コンテナ要素への参照
let containerRef: HTMLDivElement;

// インデントオフセット（ピクセル単位）
const INDENT_SIZE = 24;

let itemHeights = $state<number[]>([]);
let itemPositions = $state<number[]>([]);

// タイトルをTreeSubscriberで監視
const titleSubscriber = new TreeSubscriber<Item, string>(
    pageItem,
    "nodeChanged",
    () => pageItem.text,
    value => {
        pageItem.text = value;
    },
);

// TreeSubscriberを使って、アイテムを監視し変換する例
// 第3引数に変換関数を渡すことで、戻り値の型を変更できます
const itemChildrenCount = new TreeSubscriber<Item, number>(
    pageItem,
    "nodeChanged",
    () => pageItem.items && Tree.is(pageItem.items, Items) ? pageItem.items.length : 0,
);

const displayItems = new TreeSubscriber<Items, DisplayItem[]>(
    pageItem.items as Items,
    "treeChanged",
    () => {
        viewModel.updateFromModel(pageItem);
        return viewModel.getVisibleItems();
    },
);

// 変換結果を使った例
let childCount = $derived(itemChildrenCount.current);

// ページタイトル用のモデル
let pageTitleViewModel = $state({
    id: "page-title",
    original: pageItem,
    text: pageItem.text || "", // テキストはページアイテムから取得
    author: pageItem.author || "",
    created: pageItem.created || Date.now(), // number型として設定
    lastChanged: pageItem.lastChanged || Date.now(), // number型として設定
    votes: [],
    children: [],
});

// アイテムの高さが変更されたときに位置を再計算
function updateItemPositions() {
    let currentTop = 8; // 最初のアイテムの上部マージン
    itemPositions = itemHeights.map((height, index) => {
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
    // リソースを解放
    viewModel.dispose();
});

function handleAddItem() {
    if (pageItem && !isReadOnly && pageItem.items && Tree.is(pageItem.items, Items)) {
        // 末尾にアイテム追加
        pageItem.items.addNode(currentUser);
    }
}

function handleToggleCollapse(event: CustomEvent) {
    const { itemId } = event.detail;

    // 折りたたみ状態を変更
    viewModel.toggleCollapsed(itemId);
}

function handleIndent(event: CustomEvent) {
    // ページタイトルの場合は無視
    if (event.detail.itemId === "page-title") return;

    // インデントを増やす処理
    const { itemId } = event.detail;

    // 元のアイテムを取得
    const itemViewModel = viewModel.getViewModel(itemId);
    if (!itemViewModel) return;

    const item = itemViewModel.original;

    logger.info("Indent event received for item:", item);

    // 1. アイテムの親を取得
    const parent = Tree.parent(item);
    if (!Tree.is(parent, Items)) return;

    // 2. 親内でのアイテムのインデックスを取得
    const index = parent.indexOf(item);
    if (index <= 0) return; // 最初のアイテムはインデントできない

    // 3. 前のアイテムを取得
    const previousItem = parent[index - 1];

    try {
        // 4. 前のアイテムの子リストへアイテムを移動
        // itemIndexが確実に取得できるようにインデックスを再計算
        const itemIndex = parent.indexOf(item);

        // 移動操作の前にログを追加
        logger.info(
            `Moving item from parent (${parent.length} items) at index ${itemIndex} to previous item's children`,
        );

        // 厳密なトランザクション処理を行う
        const prevItems = previousItem.items;
        if (prevItems && Tree.is(prevItems, Items)) {
            Tree.runTransaction(parent, () => {
                // 型キャストを使用してTypeScriptエラーを回避
                (prevItems as any).moveRangeToEnd(itemIndex, itemIndex + 1, parent);
            });

            logger.info(`Indented item under previous item`);
        }
    }
    catch (error) {
        console.error("Failed to indent item:", error);
    }
}

function handleUnindent(event: CustomEvent) {
    // ページタイトルの場合は無視
    if (event.detail.itemId === "page-title") return;

    // インデントを減らす処理
    const { itemId } = event.detail;

    // 元のアイテムを取得
    const itemViewModel = viewModel.getViewModel(itemId);
    if (!itemViewModel) return;

    const item = itemViewModel.original;

    logger.info("Unindent event received for item:", item);

    // 1. アイテムの親を取得
    const parentList = Tree.parent(item);
    if (!Tree.is(parentList, Items)) return;

    // 2. 親の親を取得（親グループを取得）
    const parentItem = Tree.parent(parentList);
    if (!parentItem || !Tree.is(parentItem, Item)) return; // ルートアイテムの直下は既に最上位

    const grandParentList = Tree.parent(parentItem);
    if (!grandParentList || !Tree.is(grandParentList, Items)) return; // ルートアイテムの直下は既に最上位

    try {
        // 3. 親アイテムのindex取得
        const parentIndex = grandParentList.indexOf(parentItem);

        // 4. 親の親の、親の次の位置にアイテムを移動
        const itemIndex = parentList.indexOf(item);

        // parentListの要素をgrandParentListに移動
        const sourceItem = parentList[itemIndex];
        if (sourceItem) {
            // readonly array型に適合するようコピー
            const targetArray = grandParentList as any;

            Tree.runTransaction(grandParentList, () => {
                targetArray.moveRangeToIndex(parentIndex + 1, itemIndex, itemIndex + 1, parentList);
            });

            logger.info("Unindented item to parent level");
        }
    }
    catch (error) {
        console.error("Failed to unindent item:", error);
    }
}

// デバッグモードを有効化
(window as any).DEBUG_MODE = true;

// アイテム間のナビゲーション処理
function handleNavigateToItem(event: CustomEvent) {
    // Shift選択対応のため shiftKey と direction も取得
    const { direction, cursorScreenX, fromItemId, shiftKey } = event.detail;
    // Shiftなしの移動では既存の選択をクリア（非複数選択へ）
    if (!shiftKey) {
        reset();
    }

    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(
            `Navigation event received: direction=${direction}, fromItemId=${fromItemId}, cursorScreenX=${cursorScreenX}`,
        );
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
        const selectionRanges = Object.values(selections);
        if (selectionRanges.length === 0) return;
        const { startItemId, startOffset } = selectionRanges[0];
        const targetItemId = displayItems.current[currentIndex + 1]?.model.id;
        if (!targetItemId) return;
        const endEl = document.querySelector(`[data-item-id="${targetItemId}"] .item-text`) as HTMLElement;
        const endLen = endEl?.textContent?.length || 0;
        setSelection({
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
        const selectionRanges = Object.values(selections);
        if (selectionRanges.length === 0) return;
        const { endItemId, endOffset } = selectionRanges[0];
        const targetItemId = displayItems.current[currentIndex - 1]?.model.id;
        if (!targetItemId) return;
        const startEl = document.querySelector(`[data-item-id="${targetItemId}"] .item-text`) as HTMLElement;
        const startLen = startEl?.textContent?.length || 0;
        setSelection({
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
    const activeItem = getActiveItem();

    // アクティブなアイテムから新しいアイテムへの移動を順に処理
    const focusNewItem = () => {
        try {
            // 特殊なカーソル位置値を処理
            let cursorXValue = cursorScreenX;

            // アイテム要素からOutlinerItemコンポーネントインスタンスへの参照を取得
            const itemInstance = (item as any).__svelte?.OutlinerItem;

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

// ページタイトルの編集を開始したときのハンドラ
function handlePageTitleClick() {
    if (isReadOnly) return;

    // ページタイトルをアクティブに設定
    setActiveItem("page-title");
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

// ページタイトルの子アイテムとして追加する関数を修正
function addNewItem() {
    const items = pageItem.items;
    if (!isReadOnly && items && Tree.is(items, Items)) {
        // 先頭に追加
        items.addNode(currentUser, 0);
    }
}

// 複数行ペースト時に新規アイテムを追加
function handlePasteMultiItem(event: CustomEvent) {
    const { lines, selections, activeItemId } = event.detail;
    // 最初の選択アイテムをベースとする
    const firstItemId = activeItemId;
    const itemIndex = displayItems.current.findIndex(d => d.model.id === firstItemId);
    if (itemIndex < 0) return;
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
</script>

<div class="outliner" bind:this={containerRef}>
    <div class="toolbar">
        <div class="actions">
            {#if !isReadOnly}
                <button onclick={handleAddItem}>アイテム追加</button>
            {/if}
        </div>
    </div>

    <div class="tree-container">
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

.title-container {
    margin-bottom: 16px;
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
    left: calc(16px + var(--item-depth) * 24px);
    width: calc(100% - 32px - var(--item-depth) * 24px);
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
