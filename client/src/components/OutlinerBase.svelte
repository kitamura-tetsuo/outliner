<script lang="ts">
import { getLogger } from "$lib/logger";
import * as m from "$lib/paraglide/messages.js";
import { onMount } from "svelte";
import type { Item } from "../schema/app-schema";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
import { fluidStore } from "../stores/fluidStore.svelte";
import GlobalTextArea from "./GlobalTextArea.svelte";
import OutlinerTree from "./OutlinerTree.svelte";

const logger = getLogger("OutlinerBase");

interface Props {
    pageItem: Item;
    isReadOnly?: boolean;
    isTemporary?: boolean;
    onEdit?: () => void;
}
let {
    pageItem,
    isReadOnly = false,
    isTemporary = false,
    onEdit,
}: Props = $props();

// 編集イベントのハンドラ
function handleEdit() {
    if (isTemporary && onEdit) {
        logger.info("Temporary page edited, triggering onEdit callback");
        onEdit();
    }
}

// 明示的にページを作成するハンドラ
function handleCreatePage() {
    if (isTemporary && onEdit) {
        logger.info(
            "Create page button clicked, triggering onEdit callback",
        );
        onEdit();
    }
}

// キャンセルして前のページに戻るハンドラ
function handleCancel() {
    logger.info("Cancel button clicked, navigating back");
    // 履歴がある場合は前のページに戻る
    window.history.back();
}

// 前回のテキスト内容を保持
let previousItemText = $state("");
let previousChildItems = $state<string[]>([]);

// 初期状態を保存（pageItemのIDが変わった時のみ実行）
let pageItemId = $state<string | null>(null);

// pageItemの変更を監視する$effect
// 依存関係: pageItem.id
$effect.root(() => {
    // pageItemのIDが変わった場合のみ初期化処理を実行
    if (!pageItem || !pageItem.id) return;

    // 同じIDの場合は処理しない
    if (pageItem.id === pageItemId) return;

    // IDを更新
    pageItemId = pageItem.id;

    // 初期状態を保存する処理は初期化時に一度だけ実行する
    initializePageState();
});

// 初期状態を保存する関数
function initializePageState() {
    if (!pageItem) return;

    // テキスト内容を保存
    previousItemText = pageItem.text || "";

    // 子アイテムのテキストを保存
    const items = pageItem.items as any;
    if (items && items.length > 0) {
        previousChildItems = Array.from(
            { length: items.length },
            (_, i) => {
                const item = items[i];
                return item ? item.text || "" : "";
            },
        );
    }
    else {
        previousChildItems = [];
    }

    logger.info("Initial page state saved", {
        id: pageItem.id,
        text: previousItemText,
        childItemsCount: previousChildItems.length,
    });
}

// テキスト変更を検出
// 前回のチェック時刻を保持して頻繁な実行を防止
let lastCheckTime = $state(0);
const CHECK_INTERVAL = 300; // ミリ秒

// テキスト変更を検出する$effect
// 依存関係: pageItem.text, pageItem.items
$effect.root(() => {
    // 必要な条件をチェック
    if (!pageItem || !isTemporary) return;
    if (!pageItemId) return; // 初期化が完了していない場合はスキップ

    // 前回のチェックから一定時間経過していない場合はスキップ
    const now = Date.now();
    if (now - lastCheckTime < CHECK_INTERVAL) return;
    lastCheckTime = now;

    // 現在のテキスト内容を取得
    const currentText = pageItem.text || "";

    // テキスト変更を検出
    const textChanged = currentText !== previousItemText;

    // 子アイテムのテキストを取得
    const items = pageItem.items as any;
    const currentChildItems = getChildItemsText(items);

    // 子アイテムの変更を検出
    const childItemsChanged = hasChildItemsChanged(
        currentChildItems,
        previousChildItems,
    );

    // 変更があった場合のみ処理を実行
    if (textChanged || childItemsChanged) {
        logContentChange(
            textChanged,
            childItemsChanged,
            currentText,
            currentChildItems,
        );

        // 状態を更新
        previousItemText = currentText;
        previousChildItems = [...currentChildItems];

        // 編集イベントを発火
        handleEdit();
    }
});

// 子アイテムのテキストを配列として取得する関数
function getChildItemsText(items: any): string[] {
    const result: string[] = [];

    if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            result.push(item ? item.text || "" : "");
        }
    }

    return result;
}

// 子アイテムが変更されたかどうかを判定する関数
function hasChildItemsChanged(
    current: string[],
    previous: string[],
): boolean {
    // 子アイテムの数が変わった場合
    if (current.length !== previous.length) {
        return true;
    }

    // 子アイテムの内容が変わった場合
    for (let i = 0; i < current.length; i++) {
        if (current[i] !== previous[i]) {
            return true;
        }
    }

    return false;
}

// 内容変更をログに記録する関数
function logContentChange(
    textChanged: boolean,
    childItemsChanged: boolean,
    currentText: string,
    currentChildItems: string[],
): void {
    logger.info("Page content changed", {
        textChanged,
        childItemsChanged,
        previousText: previousItemText,
        currentText,
        previousChildItemsCount: previousChildItems.length,
        currentChildItemsCount: currentChildItems.length,
    });
}

// editorOverlayStoreの変更も監視（バックアップとして）
// 前回のカーソル数を保持
let lastCursorCount = $state(0);
let lastCursorCheckTime = $state(0);
const CURSOR_CHECK_INTERVAL = 500; // ミリ秒

// カーソル変更を監視する$effect
// 依存関係: editorOverlayStore.cursors
$effect.root(() => {
    // 必要な条件をチェック
    if (!isTemporary) return;
    if (!pageItemId) return; // 初期化が完了していない場合はスキップ

    // 前回のチェックから一定時間経過していない場合はスキップ
    const now = Date.now();
    if (now - lastCursorCheckTime < CURSOR_CHECK_INTERVAL) return;
    lastCursorCheckTime = now;

    // カーソルの変更を監視
    const cursors = editorOverlayStore.cursors;
    const cursorCount = cursors ? Object.keys(cursors).length : 0;

    // カーソル数が変わった場合のみ処理
    if (cursorCount > 0 && cursorCount !== lastCursorCount) {
        logger.debug("Cursor count changed", {
            previous: lastCursorCount,
            current: cursorCount,
        });

        lastCursorCount = cursorCount;

        // カーソル変更があった場合もチェック
        // 注: テキスト変更検出が主な方法、これはバックアップ
        handleEdit();
    }
});

onMount(() => {
    // 初期状態を保存
    initializePageState();

    // editorOverlayStoreをリセットして初期カーソルを設定
    setupInitialCursor();

    // テキストエリアにフォーカスを設定
    setInitialFocus();
});

// 初期カーソルを設定する関数
function setupInitialCursor() {
    if (!pageItem || !pageItem.id) return;

    editorOverlayStore.reset();
    editorOverlayStore.setActiveItem(pageItem.id);

    const offset = pageItem.text?.length ?? 0;
    const userId = fluidStore.currentUser?.id ?? "anonymous";

    editorOverlayStore.addCursor({
        itemId: pageItem.id,
        offset,
        isActive: true,
        userId,
    });

    logger.debug("Initial cursor set", {
        itemId: pageItem.id,
        offset,
        userId,
    });
}

// 初期フォーカスを設定する関数
function setInitialFocus() {
    // 確実にフォーカスを設定するために少し遅延させる
    setTimeout(() => {
        const textarea = editorOverlayStore.getTextareaRef();
        if (!textarea) {
            logger.warn("Textarea reference not found for initial focus");
            return;
        }

        // 直接フォーカスを設定
        textarea.focus();

        // requestAnimationFrameを使用してフォーカスを設定（より確実に）
        requestAnimationFrame(() => {
            textarea.focus();

            // デバッグ情報
            if (
                typeof window !== "undefined" &&
                (window as any).DEBUG_MODE
            ) {
                console.log(
                    `OutlinerBase: Initial focus set on global textarea. Active element is textarea: ${
                        document.activeElement === textarea
                    }`,
                );
            }
        });
    }, 100); // コンポーネントが完全にマウントされるのを待つ
}
</script>

<div class="outliner-base" data-testid="outliner-base">
    {#if isTemporary}
        <div class="temporary-page-notice bg-amber-100 p-4 mb-6 rounded-lg border-l-4 border-amber-500 shadow-md">
            <h3 class="text-lg font-semibold text-amber-800 mb-2">仮ページ</h3>
            <p class="text-amber-700 mb-4">
                このページはまだ作成されていません。編集するとページが作成されます。
            </p>
            <div class="flex gap-2">
                <button
                    onclick={handleCreatePage}
                    class="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                    ページを作成
                </button>
                <button
                    onclick={handleCancel}
                    class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                    キャンセル
                </button>
            </div>
        </div>
    {/if}
    <GlobalTextArea />
    <OutlinerTree {pageItem} {isReadOnly} />
</div>
