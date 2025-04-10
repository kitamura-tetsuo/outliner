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
</script>

<div class="outliner" bind:this={containerRef}>
    <div class="toolbar">
        <div class="title-container">
            {#if isReadOnly}
                <h2>{pageItem.text || "無題のページ"}</h2>
            {:else}
                <!-- 
                    【注意】ここでは"マジカルな連携"が起きています：
                    - SvelteのUIバインディング (bind:value) がFluid Frameworkオブジェクト (pageItem.text) に接続
                    - この連携はSvelteの変更検知とFluidの分散データモデルの両方に依存
                    - 問題が発生した場合は、以下の代替手段を検討：
                      1. 中間変数を使用 (let title = $state(""); + $effect + onblur)
                      2. TreeSubscriber + 明示的なupdateText関数の使用
                      3. Fluidオブジェクトへの書き込み操作をログ/モニタリング
                -->
                <input
                    type="text"
                    bind:value={titleSubscriber.current}
                    placeholder="ページタイトル"
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
        <!-- フラット表示の各アイテム（絶対位置配置） -->
        {#each displayItems.current as display, index (display.model.id)}
            <div
                class="item-container"
                style="--item-depth: {display.depth}; --item-index: {index}"
            >
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
            </div>
        {/each}

        {#if displayItems.current.length === 0}
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
</style>
