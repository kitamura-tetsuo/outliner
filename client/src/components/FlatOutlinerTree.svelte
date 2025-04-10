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
import { fluidClient } from "../stores/fluidStore";
import type { DisplayItem } from "../stores/OutlinerViewStore";
import { OutlinerViewStore } from "../stores/OutlinerViewStore";
import { TreeSubscriber } from "../stores/TreeSubscriber";
import FlatOutlinerItem from "./FlatOutlinerItem.svelte";

const logger = getLogger();

interface Props {
    pageItem: Item; // ページとして表示する Item
    isReadOnly?: boolean;
}

let { pageItem, isReadOnly = false }: Props = $props();

let currentUser = $state("anonymous");
let title = $state("");

// ビューストアを作成
const viewStore = new OutlinerViewStore();

// 表示アイテムの配列
let displayItems = $state<DisplayItem[]>([]);

// コンテナ要素への参照
let containerRef: HTMLDivElement;

// TreeSubscriberを使って、アイテムを監視し変換する例
// 第3引数に変換関数を渡すことで、戻り値の型を変更できます
const itemChildrenCount = new TreeSubscriber<Item, number>(
    pageItem,
    "nodeChanged",
    () => pageItem.items && Tree.is(pageItem.items, Items) ? pageItem.items.length : 0,
);

const displayItems2 = new TreeSubscriber<Items, DisplayItem[]>(
    pageItem.items as Items,
    "treeChanged",
    () => viewStore.getVisibleItems(),
);

// 変換結果を使った例
let childCount = $derived(itemChildrenCount.current);

// アイテムの変更を監視
$effect(() => {
    if (pageItem) {
        title = pageItem.text;

        // Itemsオブジェクトを監視
        if (pageItem.items && Tree.is(pageItem.items, Items)) {
            // Tree.onを使った監視
            viewStore.watchItems(pageItem.items, onItemsChanged);
        }
    }
});

// オペレーション中かどうかのフラグ
let isOperationInProgress = $state(false);

// アイテム変更時のコールバック
function onItemsChanged() {
    if (isOperationInProgress) return;

    // 表示アイテムを更新
    displayItems = viewStore.getVisibleItems();

    // フォーカス要素のIDを取得
    const focusedId = document.activeElement?.getAttribute("data-item-id");

    // フォーカスを維持
    if (focusedId) {
        setTimeout(() => {
            const element = document.querySelector(`[data-item-id="${focusedId}"]`) as HTMLElement;
            if (element) element.focus();
        }, 0);
    }
}

onMount(() => {
    if ($fluidClient?.currentUser) {
        currentUser = $fluidClient.currentUser.id;
    }
});

onDestroy(() => {
    // リソースを解放
    viewStore.dispose();
});

function handleUpdateTitle() {
    if (pageItem && !isReadOnly) {
        pageItem.updateText(title);
    }
}

function handleAddItem() {
    if (pageItem && !isReadOnly && pageItem.items && Tree.is(pageItem.items, Items)) {
        // 操作中フラグをセット
        isOperationInProgress = true;

        // アイテム追加
        const newItem = pageItem.items.addNode(currentUser);

        // 操作完了後にフォーカスを設定
        setTimeout(() => {
            const newElement = document.querySelector(`[data-item-id="${newItem.id}"]`) as HTMLElement;
            if (newElement) newElement.focus();

            // 操作中フラグをクリア
            isOperationInProgress = false;
        }, 10);
    }
}

function handleToggleCollapse(event: CustomEvent) {
    const { itemId } = event.detail;

    // 操作中フラグをセット
    isOperationInProgress = true;

    // 折りたたみ状態を変更
    viewStore.toggleCollapsed(itemId);

    // 表示を更新
    displayItems = viewStore.getVisibleItems();

    // 操作中フラグをクリア
    setTimeout(() => {
        isOperationInProgress = false;
    }, 0);
}

function handleIndent(event: CustomEvent) {
    // インデントを増やす処理
    const { itemId, focusAfter } = event.detail;

    // フォーカスIDを保存
    const focusId = itemId;

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
        // 操作中フラグをセット
        isOperationInProgress = true;

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

            // インデント後にフォーカスを設定
            setTimeout(() => {
                // 移動先の要素にフォーカス
                const movedElement = document.querySelector(`[data-item-id="${focusId}"]`) as HTMLElement;
                if (movedElement) {
                    movedElement.focus();
                }
                else {
                    if (focusAfter) focusAfter(); // フォールバック
                }

                // 操作中フラグをクリア
                isOperationInProgress = false;
            }, 10);
        }
        else {
            isOperationInProgress = false;
        }
    }
    catch (error) {
        // 操作中フラグをクリア
        isOperationInProgress = false;
        console.error("Failed to indent item:", error);
    }
}

function handleUnindent(event: CustomEvent) {
    // インデントを減らす処理
    const { itemId, focusAfter } = event.detail;

    // フォーカスIDを保存
    const focusId = itemId;

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
        // 操作中フラグをセット
        isOperationInProgress = true;

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

            // アンインデント後にフォーカスを設定
            setTimeout(() => {
                // 移動先の要素にフォーカス
                const movedElement = document.querySelector(`[data-item-id="${focusId}"]`) as HTMLElement;
                if (movedElement) {
                    movedElement.focus();
                }
                else {
                    if (focusAfter) focusAfter(); // フォールバック
                }

                // 操作中フラグをクリア
                isOperationInProgress = false;
            }, 10);
        }
        else {
            isOperationInProgress = false;
        }
    }
    catch (error) {
        // 操作中フラグをクリア
        isOperationInProgress = false;
        console.error("Failed to unindent item:", error);
    }
}
</script>

<div class="outliner" bind:this={containerRef}>
    <div class="toolbar">
        <div class="title-container">
            {#if isReadOnly}
                <h2>{title || "無題のページ"}</h2>
            {:else}
                <input
                    type="text"
                    bind:value={title}
                    placeholder="ページタイトル"
                    onblur={handleUpdateTitle}
                    class="title-input"
                />
            {/if}

            <!-- TreeSubscriberの変換結果を表示 -->
            <span class="item-count">アイテム数: {childCount}</span>
        </div>

        {#if !isReadOnly}
            <div class="actions">
                <button onclick={handleAddItem}>アイテム追加</button>
            </div>
        {/if}
    </div>

    <div class="tree-container">
        <!-- フラット表示の各アイテム -->
        {#each displayItems as display (display.model.id)}
            <FlatOutlinerItem
                model={display.model}
                depth={display.depth}
                {currentUser}
                {isReadOnly}
                isCollapsed={viewStore.isCollapsed(display.model.id)}
                hasChildren={viewStore.hasChildren(display.model.id)}
                on:toggle-collapse={handleToggleCollapse}
                on:indent={handleIndent}
                on:unindent={handleUnindent}
            />
        {/each}

        {#each displayItems2.current as display (display.model.id)}
            <FlatOutlinerItem
                model={display.model}
                depth={display.depth}
                {currentUser}
                {isReadOnly}
                isCollapsed={viewStore.isCollapsed(display.model.id)}
                hasChildren={viewStore.hasChildren(display.model.id)}
                on:toggle-collapse={handleToggleCollapse}
                on:indent={handleIndent}
                on:unindent={handleUnindent}
            />
        {/each}

        {#if displayItems.length === 0}
            <div class="empty-state">
                <p>
                    {#if isReadOnly}
                        このページにはまだ内容がありません。
                    {:else}
                        アイテムがありません。「アイテム追加」ボタンを押して始めましょう。
                    {/if}
                </p>
            </div>
        {/if}
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
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
}

.title-container {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
}

.title-input {
    width: 100%;
    font-size: 18px;
    font-weight: 500;
    padding: 4px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.item-count {
    font-size: 12px;
    color: #666;
    background: #e9e9e9;
    padding: 3px 8px;
    border-radius: 12px;
    white-space: nowrap;
}

h2 {
    margin: 0;
    font-size: 18px;
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
}

.empty-state {
    padding: 20px;
    text-align: center;
    color: #999;
}
</style>
