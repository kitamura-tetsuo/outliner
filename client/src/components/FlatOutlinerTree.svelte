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
import { editorOverlayStore } from "../stores/EditorOverlayStore";
import { fluidClient } from "../stores/fluidStore";
import type { DisplayItem } from "../stores/OutlinerViewStore";
import { OutlinerViewStore } from "../stores/OutlinerViewStore";
import { TreeSubscriber } from "../stores/TreeSubscriber";
import EditorOverlay from "./EditorOverlay.svelte";
import FlatOutlinerItem from "./FlatOutlinerItem.svelte";

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

let currentUser = $state("anonymous");

// ビューストアを作成
const viewStore = new OutlinerViewStore();

// コンテナ要素への参照
let containerRef: HTMLDivElement;

// インデントオフセット（ピクセル単位）
const INDENT_SIZE = 24;

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
        viewStore.updateFromModel(pageItem.items as Items);
        return viewStore.getVisibleItems();
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

onMount(() => {
    if ($fluidClient?.currentUser) {
        currentUser = $fluidClient.currentUser.id;
    }
});

onDestroy(() => {
    // リソースを解放
    viewStore.dispose();
});

function handleAddItem() {
    if (pageItem && !isReadOnly && pageItem.items && Tree.is(pageItem.items, Items)) {
        // アイテム追加
        pageItem.items.addNode(currentUser);
    }
}

function handleToggleCollapse(event: CustomEvent) {
    const { itemId } = event.detail;

    // 折りたたみ状態を変更
    viewStore.toggleCollapsed(itemId);
}

function handleIndent(event: CustomEvent) {
    // ページタイトルの場合は無視
    if (event.detail.itemId === "page-title") return;

    // インデントを増やす処理
    const { itemId } = event.detail;

    // 元のアイテムを取得
    const itemViewModel = viewStore.getViewModel(itemId);
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
    const itemViewModel = viewStore.getViewModel(itemId);
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
    const { direction, cursorScreenX, fromItemId } = event.detail;

    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(
            `Navigation event received: direction=${direction}, fromItemId=${fromItemId}, cursorScreenX=${cursorScreenX}`,
        );
    }

    // 左右方向の処理 (ページタイトルは特別処理)
    if (direction === "left") {
        // 左方向の移動（前のアイテムの末尾に移動）
        // ページタイトルの場合は何もしない
        if (fromItemId === "page-title") {
            // ページタイトルでは左キーを処理しない（先頭に移動することはできる）
            focusItemWithPosition("page-title", 0);
            return;
        }

        let currentIndex = displayItems.current.findIndex(item => item.model.id === fromItemId);
        if (currentIndex <= 0) {
            // 最初のアイテムの場合はページタイトルに移動
            focusItemWithPosition("page-title", Number.MAX_SAFE_INTEGER); // 末尾を指定
            return;
        }
        else {
            // 前のアイテムに移動
            const targetItemId = displayItems.current[currentIndex - 1].model.id;
            focusItemWithPosition(targetItemId, Number.MAX_SAFE_INTEGER); // 末尾を指定
            return;
        }
    }
    else if (direction === "right") {
        // 右方向の移動（次のアイテムの先頭に移動）
        if (fromItemId === "page-title") {
            // ページタイトルから右に移動する場合は最初のアイテムに移動
            if (displayItems.current.length > 0) {
                focusItemWithPosition(displayItems.current[0].model.id, 0); // 先頭を指定
            }
            return;
        }

        let currentIndex = displayItems.current.findIndex(item => item.model.id === fromItemId);
        if (currentIndex >= 0 && currentIndex < displayItems.current.length - 1) {
            // 次のアイテムに移動
            const targetItemId = displayItems.current[currentIndex + 1].model.id;
            focusItemWithPosition(targetItemId, 0); // 先頭を指定
            return;
        }
        // 最後のアイテムなら何もしない（末尾まで移動）
        focusItemWithPosition(fromItemId, Number.MAX_SAFE_INTEGER);
        return;
    }

    // 上下方向の境界ケース処理
    if (fromItemId === "page-title" && direction === "up") {
        // タイトルから上へ移動しようとした場合: タイトルの先頭にカーソル移動
        focusItemWithPosition("page-title", 0);
        return;
    }
    else if (fromItemId === "page-title" && direction === "down" && displayItems.current.length > 0) {
        // ページタイトルから下に移動する場合は最初のアイテムにフォーカス
        const targetItemId = displayItems.current[0].model.id;
        focusItemWithPosition(targetItemId, cursorScreenX);
        return;
    }
    else if (
        fromItemId !== "page-title" && direction === "up" &&
        displayItems.current.findIndex(item => item.model.id === fromItemId) === 0
    ) {
        // 最初のアイテムから上に移動する場合はページタイトルにフォーカス
        focusItemWithPosition("page-title", cursorScreenX);
        return;
    }
    else if (
        direction === "down" &&
        displayItems.current.findIndex(item => item.model.id === fromItemId) === displayItems.current.length - 1
    ) {
        // 最後のアイテムから下へ移動しようとした場合: 最後のアイテムの末尾にカーソル移動
        focusItemWithPosition(fromItemId, Number.MAX_SAFE_INTEGER);
        return;
    }

    // 通常のアイテム間ナビゲーション
    let currentIndex = -1;

    if (fromItemId === "page-title") {
        currentIndex = -1; // ページタイトルは-1として扱う
    }
    else {
        currentIndex = displayItems.current.findIndex(item => item.model.id === fromItemId);
    }

    if (currentIndex === -1 && fromItemId !== "page-title") {
        console.error(`Could not find item with ID: ${fromItemId} in displayItems`);
        return;
    }

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
        focusItemWithPosition(targetItemId, cursorScreenX);
    }
    // ターゲットがページタイトルの場合
    else if (targetIndex === -1 && direction === "up") {
        focusItemWithPosition("page-title", cursorScreenX);
    }
}

// 指定したアイテムにフォーカスし、カーソル位置を設定する
function focusItemWithPosition(itemId: string, cursorScreenX?: number) {
    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
        console.log(`Focusing item ${itemId} with cursor X: ${cursorScreenX}px`);
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

            // アイテム要素からFlatOutlinerItemコンポーネントインスタンスへの参照を取得
            const itemInstance = (item as any).__svelte?.FlatOutlinerItem;

            // カスタムイベントを作成してアイテムに発火
            const event = new CustomEvent("focus-item", {
                detail: {
                    cursorScreenX: cursorXValue,
                },
                bubbles: false,
                cancelable: true,
            });

            // イベントをディスパッチ
            item.dispatchEvent(event);

            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Dispatched focus-item event to ${itemId} with X: ${cursorXValue}px`);
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
    editorOverlayStore.setActiveItem("page-title");
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
        <!-- ページタイトル（特別なアイテムとして扱う） -->
        <div class="item-container title-container" style="--item-depth: 0; --item-index: -1">
            <FlatOutlinerItem
                model={pageTitleViewModel}
                depth={0}
                currentUser={currentUser}
                isReadOnly={isReadOnly}
                isCollapsed={false}
                hasChildren={childCount > 0}
                on:toggle-collapse={handleToggleCollapse}
                on:navigate-to-item={handleNavigateToItem}
                isPageTitle={true}
            />
        </div>

        <!-- フラット表示の各アイテム（絶対位置配置） -->
        {#each displayItems.current as display, index (display.model.id)}
            <div
                class="item-container"
                style="--item-depth: {display.depth}; --item-index: {index}"
            >
                <FlatOutlinerItem
                    model={display.model}
                    depth={display.depth}
                    currentUser={currentUser}
                    isReadOnly={isReadOnly}
                    isCollapsed={viewStore.isCollapsed(display.model.id)}
                    hasChildren={viewStore.hasChildren(display.model.id)}
                    on:toggle-collapse={handleToggleCollapse}
                    on:indent={handleIndent}
                    on:unindent={handleUnindent}
                    on:navigate-to-item={handleNavigateToItem}
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
            <EditorOverlay />
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
}

.toolbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 8px 16px;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
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
}

.item-container {
    position: absolute;
    left: calc(16px + var(--item-depth) * 24px); /* インデントに応じてX座標を計算 */
    top: calc(8px + var(--item-index) * 32px); /* 各アイテムの高さを32pxと仮定 */
    width: calc(100% - 32px - var(--item-depth) * 24px); /* 幅を調整 */
    transition: left 0.2s ease, top 0.2s ease; /* 位置変更時のアニメーション */
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
