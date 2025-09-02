<script lang="ts">
import { goto } from "$app/navigation";
import { browser } from "$app/environment";
import {
    onDestroy,
    onMount,
} from "svelte";
import { getLogger } from "../lib/logger";
import { YjsProjectManager } from "../lib/yjsProjectManager.svelte";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
import type { DisplayItem } from "../stores/OutlinerViewModel";
import { OutlinerViewModel } from "../stores/OutlinerViewModel";
import EditorOverlay from "./EditorOverlay.svelte";
import OutlinerItem from "./OutlinerItem.svelte";

const logger = getLogger();
const logPrefix = "🔧 [YjsOutlinerTree]";

/**
 * Yjsモード専用のOutlinerTreeコンポーネント
 * Fluidライブラリに依存しない完全なYjs実装
 */

interface Props {
    projectId: string;
    pageId: string;
    projectName: string;
    pageName: string;
    isReadOnly?: boolean;
    onEdit?: () => void;
}

let { projectId, pageId, projectName, pageName, isReadOnly = false, onEdit }: Props = $props();

// Yjsプロジェクトマネージャー
let yjsProjectManager: YjsProjectManager | null = null;
let currentUser = $state('anonymous'); // Yjsモードでは簡易ユーザー管理

// Yjsビューストアを作成
const viewModel = new OutlinerViewModel(pageName);

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

// 表示アイテムの状態
let displayItems = $state<{ current: DisplayItem[] }>({ current: [] });

// 無限ループを防ぐためのフラグ
let isUpdatingDisplayItems = false;
let lastUpdateTime = 0;
let lastItemsLength = -1;

// アイテムの位置を更新
function updateItemPositions() {
    let currentTop = 0;
    itemPositions = itemHeights.map((height, index) => {
        const position = currentTop;
        currentTop += height || 40; // デフォルト高さ40px
        return position;
    });
}

// 表示アイテムを更新
function updateDisplayItems() {
    if (isUpdatingDisplayItems) return;
    
    // removed throttle for stability in tests
    // const now = Date.now();
    // if (now - lastUpdateTime < 50) return; // 50ms以内の連続更新を防ぐ

    
    isUpdatingDisplayItems = true;
    lastUpdateTime = Date.now();
    
    try {
        const newDisplayItems = viewModel.getDisplayItems();
        logger.info(`YjsOutlinerTree updateDisplayItems: length=${newDisplayItems.length}`);

        // 配列の長さが変わった場合のみ高さ配列を更新
        if (newDisplayItems.length !== lastItemsLength) {
            itemHeights = new Array(newDisplayItems.length).fill(0);
            lastItemsLength = newDisplayItems.length;
        }

        displayItems.current = newDisplayItems;

        // 次のフレームで位置を更新
        requestAnimationFrame(() => {
            updateItemPositions();
        });
        
    } finally {
        isUpdatingDisplayItems = false;
    }
}

// Yjsデータの変更を監視
function setupYjsDataWatcher() {
    if (!yjsProjectManager) return;
    
    // ページTreeManagerを取得してビューモデルに設定
    yjsProjectManager.connectToPage(pageId).then(treeManager => {
        viewModel.setPageTreeManager(treeManager);
        
        // Yjsデータの変更を監視
        treeManager.onUpdate(() => {
            viewModel.updateFromYjsData();
            updateDisplayItems();
        });
        
        // 初期データを読み込み
        viewModel.updateFromYjsData();
        updateDisplayItems();
    }).catch(error => {
        logger.error("Failed to connect to page:", error);
    });
}

// アイテム追加ハンドラー
async function handleAddItem() {
    if (!yjsProjectManager || isReadOnly) return;
    
    try {
        console.log("🔧 [YjsOutlinerTree] Adding new item...");
        
        const itemText = "新しいアイテム";
        const author = currentUser;
        
        // Yjsにアイテムを追加
        const yjsItemId = await yjsProjectManager.addItemToPage(pageId, itemText, author);
        
        if (yjsItemId) {
            console.log(`🔧 [YjsOutlinerTree] ✅ Yjs item created: ${yjsItemId} for "${itemText}"`);

            // ビューモデルを更新
            viewModel.updateFromYjsData();
            updateDisplayItems();

            // 追加したアイテムにカーソルを設定して即編集可能にする
            try {
                editorOverlayStore.setCursor({ itemId: yjsItemId, offset: 0, isActive: true, userId: 'local' });
                // フォーカスの確保
                const ta = editorOverlayStore.getTextareaRef();
                if (ta) {
                    ta.focus();
                    requestAnimationFrame(() => ta.focus());
                    setTimeout(() => ta.focus(), 10);
                }
            } catch (e) {
                console.warn('Failed to set cursor to new item', e);
            }
        } else {
            console.warn(`🔧 [YjsOutlinerTree] ❌ Failed to create Yjs item for "${itemText}"`);
        }
    } catch (error) {
        console.error("🔧 [YjsOutlinerTree] Error adding item:", error);
    }
}

// 折りたたみ切り替えハンドラー
function handleToggleCollapse(event: CustomEvent) {
    const { itemId } = event.detail;
    viewModel.toggleCollapse(itemId);
    updateDisplayItems();
}

// インデントハンドラー
function handleIndent(event: CustomEvent) {
    const { itemId } = event.detail;
    // TODO: Yjsでのインデント実装
    console.log("🔧 [YjsOutlinerTree] Indent:", itemId);
}

// アンインデントハンドラー
function handleUnindent(event: CustomEvent) {
    const { itemId } = event.detail;
    // TODO: Yjsでのアンインデント実装
    console.log("🔧 [YjsOutlinerTree] Unindent:", itemId);
}

// アイテムナビゲーションハンドラー
function handleNavigateToItem(event: CustomEvent) {
    const { itemId, offset } = event.detail;
    console.log("🔧 [YjsOutlinerTree] Navigate to item:", itemId, offset);
    
    // カーソル位置を設定
    editorOverlayStore.setCursor({
        itemId,
        offset,
        isActive: true,
        userId: currentUser,
    });
}

// アイテムリサイズハンドラー
function handleItemResize(event: CustomEvent) {
    const { index, height } = event.detail;
    if (itemHeights[index] !== height) {
        itemHeights[index] = height;
        updateItemPositions();
    }
}

// 兄弟アイテム追加ハンドラー
function handleAddSibling(event: CustomEvent) {
    const { afterItemId } = event.detail;
    console.log("🔧 [YjsOutlinerTree] Add sibling after:", afterItemId);
    // TODO: Yjsでの兄弟アイテム追加実装
}

// ツリーマウスダウンハンドラー
function handleTreeMouseDown(event: MouseEvent) {
    // ドラッグ選択の開始処理
    console.log("🔧 [YjsOutlinerTree] Tree mouse down");
}

// ツリーマウスアップハンドラー
function handleTreeMouseUp(event: MouseEvent) {
    // ドラッグ選択の終了処理
    console.log("🔧 [YjsOutlinerTree] Tree mouse up");
}

onMount(async () => {
    logger.info("YjsOutlinerTree mounted");

    try {
        // YjsProjectManagerを初期化
        yjsProjectManager = new YjsProjectManager(projectId);
        await yjsProjectManager.connect();

        // 接続の確立を待機（エミュレータのトークン発行遅延対策）
        const connected = await yjsProjectManager.waitForConnection(8000);
        logger.info(`YjsOutlinerTree project connection status: ${connected ? 'connected' : 'timeout'}`);

        // グローバルに公開（デバッグ用）
        if (typeof window !== "undefined") {
            (window as any).__YJS_PROJECT_MANAGER__ = yjsProjectManager;
            (window as any).__YJS_OUTLINER_VIEW_MODEL__ = viewModel;
            (window as any).__CURRENT_PAGE_ID__ = pageId;
            // ボタン存在確認ログ
            requestAnimationFrame(() => {
                const btn = document.querySelector('button[data-testid="add-item-btn"]');
                console.log(`${logPrefix} add-item button present after mount:`, !!btn, 'isReadOnly=', isReadOnly);
            });
        }

        // Yjsデータの監視を開始
        setupYjsDataWatcher();

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
        
        logger.info("YjsOutlinerTree initialized successfully");
        
    } catch (error) {
        logger.error("Failed to initialize YjsOutlinerTree:", error);
    }
});

onDestroy(() => {
    logger.info("YjsOutlinerTree destroyed");
    
    // クリーンアップ
    if (yjsProjectManager) {
        yjsProjectManager.disconnect();
    }
    
    // グローバル変数をクリア
    if (typeof window !== "undefined") {
        delete (window as any).__YJS_PROJECT_MANAGER__;
        delete (window as any).__YJS_OUTLINER_VIEW_MODEL__;
        delete (window as any).__CURRENT_PAGE_ID__;
    }
});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="outliner" bind:this={containerRef} onmousedown={handleTreeMouseDown} onmouseup={handleTreeMouseUp} role="application">
    <div class="toolbar" data-testid="outliner-toolbar">
        <div class="actions">
            {#if !isReadOnly}
                <button data-testid="add-item-btn" onclick={() => {
                    console.log("🔧 [YjsOutlinerTree] Button clicked, calling handleAddItem");
                    handleAddItem();
                }}>アイテム追加</button>
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
                />
            </div>
        {/each}
    </div>

    <!-- エディターオーバーレイ（SSRガード） -->
    {#if browser}
        <EditorOverlay />
    {/if}
</div>

<style>
.outliner {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    position: relative;
    background-color: var(--bg-primary);
}

.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--bg-secondary);
}

.actions {
    display: flex;
    gap: 8px;
}

.actions button {
    padding: 6px 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--bg-primary);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 14px;
}

.actions button:hover {
    background-color: var(--bg-hover);
}

.tree-container {
    flex: 1;
    position: relative;
    overflow-y: auto;
    padding: 16px;
}

.item-container {
    position: absolute;
    width: 100%;
    left: 0;
    transition: top 0.2s ease;
}
</style>
