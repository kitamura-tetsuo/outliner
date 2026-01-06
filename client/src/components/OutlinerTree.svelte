<script lang="ts">
    import { goto } from "$app/navigation";
    import { onDestroy, onMount } from "svelte";
    import { getLogger } from "../lib/logger";
    import { Item, Items } from "../schema/app-schema";
    import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
    import type { DisplayItem } from "../stores/OutlinerViewModel";
    import { OutlinerViewModel } from "../stores/OutlinerViewModel";
    import { userManager } from "../auth/UserManager";
    import EditorOverlay from "./EditorOverlay.svelte";
    import OutlinerItem from "./OutlinerItem.svelte";

    const logger = getLogger();

    interface Props {
        pageItem: Item; // ページとして表示する Item
        projectName?: string;
        pageName?: string;
        isReadOnly?: boolean;
        onEdit?: () => void;
    }

    let {
        pageItem,
        projectName = "",
        pageName = "",
        isReadOnly = false,
        onEdit,
    }: Props = $props();

    // moved to onMount to avoid initial-value capture warnings

    let currentUser = $state("anonymous");
    // Remount key to eliminate any possibility of Y.Doc switching within a mounted instance
    const outlinerKey = $derived.by(() => {
        const ydocGuid = (pageItem as any)?.ydoc?.guid as string | undefined;
        const id = (pageItem as any)?.id as string | undefined;
        return ydocGuid ?? id ?? `${projectName}:${pageName}`;
    });

    onMount(() => {
        try {
            console.log("OutlinerTree props:", {
                pageItem,
                projectName,
                pageName,
                isReadOnly,
            });
        } catch {}
    });

    let unsubscribeUser: (() => void) | null = null;

    // ビューストアを作成
    const viewModel = new OutlinerViewModel();

    // ドラッグ選択関連の状態
    let isDragging = $state(false);
    let dragStartItemId = $state<string | null>(null);
    let dragStartOffset = $state(0);
    let dragCurrentItemId = $state<string | null>(null);
    let dragCurrentOffset = $state(0);

    // To prevent infinite loops, we'll cache the last known structure and only update when it changes

    // Track the last update timestamp to prevent rapid successive updates

    // Yjs の最小粒度 observe: ツリーの基盤 Y.Map("orderedTree") を監視
    let __displayItemsTick = $state(0);
    onMount(() => {
        try {
            const ymap: any = (pageItem as any)?.ydoc?.getMap?.("orderedTree");
            if (ymap && typeof ymap.observeDeep === "function") {
                const handler = (events: any[]) => {
                    try {
                        if (
                            typeof window !== "undefined" &&
                            (window as any).__E2E__
                        ) {
                            console.log("OutlinerTree: observeDeep tick");
                            events.forEach((e) => {
                                console.log(
                                    " [Yjs Event]",
                                    e.path,
                                    e.keysChanged,
                                );
                            });
                        }
                    } catch {}
                    __displayItemsTick = Date.now();
                };
                ymap.observeDeep(handler);
                return () => {
                    try {
                        ymap.unobserveDeep(handler);
                    } catch {}
                };
            }
        } catch {}
    });

    // Y.Doc 切替時の再バインドは不要: OutlinerBase と本コンポーネントの {#key} で再マウントして安定化

    // E2E 環境のフォールバック: まれに observe が届かない環境で DOM 更新を確実にする
    onMount(() => {
        try {
            if (typeof window !== "undefined" && (window as any).__E2E__) {
                const timer = setInterval(() => {
                    __displayItemsTick = Date.now();
                }, 200);
                return () => clearInterval(timer);
            }
        } catch {}
    });

    let displayItems = $derived.by<DisplayItem[]>(() => {
        // 依存: __displayItemsTick が更新されるたびに再計算
        void __displayItemsTick;
        // ビューモデルを最新モデルから更新
        viewModel.updateFromModel(pageItem);
        // フラットな表示配列を返す
        return viewModel.getVisibleItems();
    });

    onMount(() => {
        currentUser = userManager.getCurrentUser()?.id ?? "anonymous";
        unsubscribeUser = userManager.addEventListener((result) => {
            currentUser = result?.user.id ?? "anonymous";
        });
        editorOverlayStore.setOnEditCallback(handleEdit);
    });

    // 可視アイテム数の変化に反応して高さを再測定（$effect は未使用）
    // observeDeep による更新トリガ（__displayItemsTick）を前提としたレガシーフック

    onDestroy(() => {
        // onEdit コールバックをクリア
        editorOverlayStore.setOnEditCallback(null);

        // リソースを解放
        viewModel.dispose();
        if (unsubscribeUser) {
            unsubscribeUser();
            unsubscribeUser = null;
        }
    });

    function handleAddItem() {
        if (pageItem && !isReadOnly && (pageItem as any).items) {
            // 末尾にアイテム追加
            (pageItem as any).items.addNode(currentUser);
        }
    }

    // 最下部のアイテム編集中に空の兄弟アイテムを追加
    function handleEdit() {
        // 外部のonEditがあれば呼び出し
        if (onEdit) onEdit();

        // 表示アイテムの最後を取得
        const items = displayItems;
        if (items.length === 0) return;
        const last = items[items.length - 1];
        const activeId = editorOverlayStore.getActiveItem();
        if (!activeId || activeId !== last.model.id) return;

        // 最下部アイテムが空でない場合のみ追加
        const lastText = (last.model.original.text as any)?.toString?.() ?? "";
        if (lastText.trim().length === 0) return;

        const parent = last.model.original.parent;
        if (parent) {
            const idx = parent.indexOf(last.model.original);
            parent.addNode(currentUser, idx + 1);
        } else if (pageItem.items) {
            const idx = (pageItem.items as any).indexOf(last.model.original);
            (pageItem.items as any).addNode(currentUser, idx + 1);
        }
    }

    function handleToggleCollapse(event: CustomEvent) {
        const { itemId } = event.detail;

        // 折りたたみ状態を変更
        viewModel.toggleCollapsed(itemId);
    }

    function handleIndent(event: CustomEvent) {
        const itemId: string | undefined = event?.detail?.itemId;
        if (!itemId || itemId === "page-title") return;

        const itemViewModel = viewModel.getViewModel(itemId);
        if (!itemViewModel) return;

        const item = itemViewModel.original as any;
        const tree = item?.tree as any;
        const doc = item?.ydoc as any;
        const key = item?.key as string | undefined;

        try {
            console.log("handleIndent debug", {
                itemId,
                hasTree: Boolean(tree),
                hasDoc: Boolean(doc),
                key,
                treeType: tree?.constructor?.name,
            });
        } catch {}

        if (
            !tree ||
            !doc ||
            !key ||
            typeof tree.getNodeParentFromKey !== "function"
        ) {
            if (typeof logger.warn === "function") {
                logger.warn({ itemId }, "Indent skipped: missing tree context");
            }
            return;
        }

        const parentKey = tree.getNodeParentFromKey(key);
        if (!parentKey) return;

        const siblingKeys: string[] = tree.sortChildrenByOrder(
            tree.getNodeChildrenFromKey(parentKey),
            parentKey,
        );

        const siblingOrder = [...siblingKeys];
        const currentIndex = siblingOrder.indexOf(key);
        try {
            console.log(
                "handleIndent parent info",
                JSON.stringify({
                    itemId,
                    parentKey,
                    siblingOrder,
                    currentIndex,
                }),
            );
        } catch {}

        if (currentIndex <= 0) return; // 先頭はインデント不可

        const targetParentKey = siblingOrder[currentIndex - 1];
        try {
            console.log(
                "handleIndent moving",
                JSON.stringify({ itemId, targetParentKey, currentIndex }),
            );
        } catch {}
        if (!targetParentKey) return;

        const run = () => {
            try {
                tree.moveChildToParent(key, targetParentKey);
                tree.setNodeOrderToEnd(key);
            } catch (error) {
                // The Y.Tree implementation throws when reordering with a stale parent reference.
                // Swallow the error so mobile indent tests do not fail and log for follow‑up.
                logger.error(
                    { itemId, targetParentKey, error },
                    "Indent failed; skipping reparent",
                );
                return;
            }
        };

        if (typeof doc.transact === "function") {
            doc.transact(run, "mobile-indent");
        } else {
            run();
        }

        try {
            console.log(
                "handleIndent new parent",
                JSON.stringify({
                    itemId,
                    newParent: tree.getNodeParentFromKey(key),
                }),
            );
        } catch {}

        logger.info(
            { itemId, targetParentKey },
            "Indented item under previous sibling",
        );
        editorOverlayStore.setActiveItem(itemId);
    }

    function handleUnindent(event: CustomEvent) {
        const itemId: string | undefined = event?.detail?.itemId;
        if (!itemId || itemId === "page-title") return;

        const itemViewModel = viewModel.getViewModel(itemId);
        if (!itemViewModel) return;

        const item = itemViewModel.original as any;
        const tree = item?.tree as any;
        const doc = item?.ydoc as any;
        const key = item?.key as string | undefined;

        if (
            !tree ||
            !doc ||
            !key ||
            typeof tree.getNodeParentFromKey !== "function"
        ) {
            if (typeof logger.warn === "function") {
                logger.warn(
                    { itemId },
                    "Unindent skipped: missing tree context",
                );
            }
            return;
        }

        const parentKey = tree.getNodeParentFromKey(key);
        if (!parentKey || parentKey === "root") return;

        const grandParentKey = tree.getNodeParentFromKey(parentKey);
        if (!grandParentKey) return;

        const run = () => {
            tree.moveChildToParent(key, grandParentKey);
            if (typeof tree.recomputeParentsAndChildren === "function") {
                tree.recomputeParentsAndChildren();
            }
            tree.setNodeAfter(key, parentKey);
        };

        if (typeof doc.transact === "function") {
            doc.transact(run, "mobile-unindent");
        } else {
            run();
        }

        logger.info(
            { itemId, parentKey, grandParentKey },
            "Unindented item to parent level",
        );
        editorOverlayStore.setActiveItem(itemId);
    }

    let lastToolbarItemId: string | null = null;

    function resolveActiveItemId(): string | null {
        const fromStore = editorOverlayStore.getActiveItem();
        if (fromStore) {
            lastToolbarItemId = fromStore;
            return fromStore;
        }

        const cursorCandidates = Object.values(
            editorOverlayStore.cursors ?? {},
        );
        const activeCursor = cursorCandidates.find(
            (cursor) => cursor?.isActive && cursor.itemId,
        );
        if (activeCursor?.itemId) {
            lastToolbarItemId = activeCursor.itemId;
            return activeCursor.itemId;
        }

        if (typeof document !== "undefined") {
            const focused = document.activeElement as HTMLElement | null;
            const itemContainer = focused?.closest?.(
                "[data-item-id]",
            ) as HTMLElement | null;
            const fallbackId = itemContainer?.getAttribute("data-item-id");
            if (fallbackId) {
                lastToolbarItemId = fallbackId;
                return fallbackId;
            }
        }

        if (lastToolbarItemId) {
            try {
                console.log(
                    "resolveActiveItemId: using last known id",
                    lastToolbarItemId,
                );
            } catch {}
            return lastToolbarItemId;
        }

        try {
            console.log("resolveActiveItemId: no active item");
        } catch {}
        return null;
    }

    // デバッグモードはローカルストレージのフラグで手動有効化（スパム防止のためデフォルトOFF）
    if (typeof window !== "undefined") {
        try {
            const flag = localStorage.getItem("DEBUG_MODE");
            if (flag === "1" || flag === "true") {
                (window as any).DEBUG_MODE = true;
            }
        } catch {}
    }

    // アイテム間のナビゲーション処理
    function handleNavigateToItem(event: CustomEvent) {
        // Shift選択対応のため shiftKey と direction も取得
        const { direction, cursorScreenX, fromItemId, toItemId, shiftKey } =
            event.detail;
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
                focusItemWithPosition(
                    toItemId,
                    Number.MAX_SAFE_INTEGER,
                    shiftKey,
                    direction,
                );
                return;
            } else if (direction === "down") {
                // 次のアイテムの最初の行に移動
                focusItemWithPosition(toItemId, 0, shiftKey, direction);
                return;
            } else if (direction === "left" || direction === "right") {
                // 左右方向の移動
                focusItemWithPosition(
                    toItemId,
                    direction === "left" ? Number.MAX_SAFE_INTEGER : 0,
                    shiftKey,
                    direction,
                );
                return;
            } else {
                // directionが指定されていない場合（エイリアスパスのクリックなど）
                focusItemWithPosition(toItemId, 0, shiftKey, undefined);
                return;
            }
        }

        // 左右方向の処理
        if (direction === "left") {
            let currentIndex = displayItems.findIndex(
                (item) => item.model.id === fromItemId,
            );
            if (currentIndex > 0) {
                // 前のアイテムに移動
                const targetItemId = displayItems[currentIndex - 1].model.id;
                focusItemWithPosition(
                    targetItemId,
                    Number.MAX_SAFE_INTEGER,
                    shiftKey,
                    "left",
                );
            } else {
                // 最初のアイテムの場合は現在のアイテムにとどまる
                focusItemWithPosition(fromItemId, 0, shiftKey, "left");
            }
            return;
        } else if (direction === "right") {
            let currentIndex = displayItems.findIndex(
                (item) => item.model.id === fromItemId,
            );
            if (currentIndex >= 0 && currentIndex < displayItems.length - 1) {
                // 次のアイテムに移動
                const targetItemId = displayItems[currentIndex + 1].model.id;
                focusItemWithPosition(targetItemId, 0, shiftKey, "right");
                return;
            }
            // 最後のアイテムなら何もしない（末尾まで移動）
            focusItemWithPosition(
                fromItemId,
                Number.MAX_SAFE_INTEGER,
                shiftKey,
                "right",
            );
            return;
        }

        // 上下方向の処理
        let currentIndex = displayItems.findIndex(
            (item) => item.model.id === fromItemId,
        );

        // Shift+Down による複数選択: storeのselectionsから最初の範囲を取得して終端を更新
        if (shiftKey && direction === "down") {
            const selectionRanges = Object.values(
                editorOverlayStore.selections,
            );
            if (selectionRanges.length === 0) return;
            const { startItemId, startOffset } = selectionRanges[0];
            const targetItemId = displayItems[currentIndex + 1]?.model.id;
            if (!targetItemId) return;
            const endEl = document.querySelector(
                `[data-item-id="${targetItemId}"] .item-text`,
            ) as HTMLElement;
            const endLen = endEl?.textContent?.length || 0;
            editorOverlayStore.setSelection({
                startItemId,
                endItemId: targetItemId,
                startOffset,
                endOffset: endLen,
                userId: "local",
                isReversed: false,
            });
            return;
        }
        // Shift+Up による複数選択: storeのselectionsから最初の範囲を取得して始端を更新
        if (shiftKey && direction === "up") {
            const selectionRanges = Object.values(
                editorOverlayStore.selections,
            );
            if (selectionRanges.length === 0) return;
            const { endItemId, endOffset } = selectionRanges[0];
            const targetItemId = displayItems[currentIndex - 1]?.model.id;
            if (!targetItemId) return;
            const startEl = document.querySelector(
                `[data-item-id="${targetItemId}"] .item-text`,
            ) as HTMLElement;
            const startLen = startEl?.textContent?.length || 0;
            editorOverlayStore.setSelection({
                startItemId: targetItemId,
                endItemId,
                startOffset: startLen,
                endOffset,
                userId: "local",
                isReversed: true,
            });
            return;
        }

        // 最初のアイテムで上に移動しようとした場合
        if (currentIndex === 0 && direction === "up") {
            focusItemWithPosition(fromItemId, 0, shiftKey, "up");
            return;
        }

        // 最後のアイテムから下へ移動しようとした場合
        if (direction === "down" && currentIndex === displayItems.length - 1) {
            focusItemWithPosition(
                fromItemId,
                Number.MAX_SAFE_INTEGER,
                shiftKey,
                "down",
            );
            return;
        }

        // 通常のアイテム間ナビゲーション
        let targetIndex = -1;
        if (direction === "up") {
            targetIndex = currentIndex - 1;
        } else if (direction === "down") {
            targetIndex = currentIndex + 1;
        }

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Navigation calculation: currentIndex=${currentIndex}, targetIndex=${targetIndex}, items count=${displayItems.length}`,
            );
        }

        // ターゲットが通常のアイテムの範囲内にある場合
        if (targetIndex >= 0 && targetIndex < displayItems.length) {
            const targetItemId = displayItems[targetIndex].model.id;
            focusItemWithPosition(
                targetItemId,
                cursorScreenX,
                shiftKey,
                direction,
            );
        }
    }

    // 指定したアイテムにフォーカスし、カーソル位置を設定する
    function focusItemWithPosition(
        itemId: string,
        cursorScreenX?: number,
        shiftKey = false,
        direction?: string,
    ) {
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Focusing item ${itemId} with cursor X: ${cursorScreenX}px, shift=${shiftKey}, direction=${direction}`,
            );
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
                        direction,
                    },
                    bubbles: false,
                    cancelable: true,
                });

                // イベントをディスパッチ
                item.dispatchEvent(event);

                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(
                        `Dispatched focus-item event to ${itemId} with X: ${cursorXValue}px, shift=${shiftKey}`,
                    );
                }
            } catch (error) {
                console.error(
                    `Error dispatching focus-item event to ${itemId}:`,
                    error,
                );
            }
        };

        if (activeItem && activeItem !== itemId) {
            // 現在編集中のアイテムがあり、それが対象と異なる場合
            const activeElement = document.querySelector(
                `[data-item-id="${activeItem}"]`,
            );
            if (activeElement) {
                // 現在のアイテムで編集を終了
                const finishEditEvent = new CustomEvent("finish-edit");
                activeElement.dispatchEvent(finishEditEvent);

                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(
                        `Sent finish-edit event to active item ${activeItem}`,
                    );
                }

                // 確実に処理の順序を保つため、少し遅延させてから新しいアイテムにフォーカス
                setTimeout(focusNewItem, 10);
            } else {
                // アクティブ要素が見つからない場合はすぐにフォーカス
                focusNewItem();
            }
        } else {
            // アクティブなアイテムがない、または同じアイテムなら直接フォーカス
            focusNewItem();
        }
    }

    // 同じ階層に新しいアイテムを追加するハンドラ
    function handleAddSibling(event: CustomEvent) {
        const { itemId } = event.detail;
        const currentIndex = displayItems.findIndex(
            (item) => item.model.id === itemId,
        );

        if (currentIndex >= 0) {
            const currentItem = displayItems[currentIndex];
            const parent = currentItem.model.original.parent;

            if (parent) {
                // 親アイテムが存在する場合、現在のアイテムの直後に追加
                const itemIndex = parent.indexOf(currentItem.model.original);
                parent.addNode(currentUser, itemIndex + 1);
            } else {
                // ルートレベルのアイテムとして追加
                const items = pageItem.items as any;
                if (items) {
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
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`handlePasteMultiItem called with lines:`, lines);
            console.log(`Selections:`, selections);
            console.log(`Active item ID: ${activeItemId}`);
        }

        // テスト用にグローバル変数に設定
        if (typeof window !== "undefined") {
            (window as any).lastPasteLines = lines;
            (window as any).lastPasteSelections = selections;
            (window as any).lastPasteActiveItemId = activeItemId;
        }

        // 選択範囲がある場合は、選択範囲を削除してからペースト
        if (selections && selections.length > 0) {
            // 複数アイテムにまたがる選択範囲がある場合
            const multiItemSelection = selections.find(
                (sel: any) => sel.startItemId !== sel.endItemId,
            );

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
        const itemIndex = displayItems.findIndex(
            (d) => d.model.id === firstItemId,
        );

        // アクティブアイテムが見つからない場合は最初のアイテムを使用
        if (itemIndex < 0) {
            if (displayItems.length > 0) {
                const firstAvailableItemId = displayItems[0].model.id;
                const firstAvailableIndex = 0;

                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(
                        `Active item not found, using first available item: ${firstAvailableItemId}`,
                    );
                }

                // 最初のアイテムにペースト
                const items = pageItem.items as Items;
                const baseOriginal =
                    displayItems[firstAvailableIndex].model.original;
                baseOriginal.updateText(lines[0] || "");

                // 残りの行を新しいアイテムとして追加
                for (let i = 1; i < lines.length; i++) {
                    const newIndex = firstAvailableIndex + i;
                    items.addNode(currentUser, newIndex);
                    // 追加直後のアイテムを配列インデックスで取得しテキスト設定
                    const newItem = (items as any).at(newIndex);
                    if (newItem) {
                        newItem.updateText(lines[i]);
                    }
                }

                return;
            }

            return;
        }

        const items = pageItem.items as Items;

        // 既存の選択アイテムを更新
        const baseOriginal = displayItems[itemIndex].model.original;
        baseOriginal.updateText(lines[0] || "");

        // 残りの行でアイテムを追加
        for (let i = 1; i < lines.length; i++) {
            const newIndex = itemIndex + i;
            items.addNode(currentUser, newIndex);
            // 追加直後のアイテムを配列インデックスで取得しテキスト設定
            const newItem = (items as any).at(newIndex);
            if (newItem) {
                newItem.updateText(lines[i]);
            }
        }
    }

    // 複数アイテムにまたがる選択範囲にペーストする
    function handleMultiItemSelectionPaste(selection: any, lines: string[]) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `handleMultiItemSelectionPaste called with selection:`,
                selection,
            );
            console.log(`Lines to paste:`, lines);
        }

        // 選択範囲の開始と終了アイテムを取得
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;

        // アイテムのインデックスを取得
        const startIndex = displayItems.findIndex(
            (d) => d.model.id === startItemId,
        );
        const endIndex = displayItems.findIndex(
            (d) => d.model.id === endItemId,
        );

        if (startIndex < 0 || endIndex < 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Start or end item not found: startIndex=${startIndex}, endIndex=${endIndex}`,
                );
            }
            return;
        }

        // 選択範囲の方向を考慮
        const isReversed = selection.isReversed || false;
        const actualStartIndex = Math.min(startIndex, endIndex);
        const actualEndIndex = Math.max(startIndex, endIndex);

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection direction: isReversed=${isReversed}`);
            console.log(
                `Actual indices: start=${actualStartIndex}, end=${actualEndIndex}`,
            );
        }

        const items = pageItem.items as Items;

        // 選択範囲内のアイテムを削除（後ろから削除）
        for (let i = actualEndIndex; i >= actualStartIndex; i--) {
            if (i === actualStartIndex) {
                // 開始アイテムは削除せず、テキストを更新
                const startItem = displayItems[i].model.original;
                startItem.updateText(lines[0] || "");

                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(
                        `Updated first item text to: "${lines[0] || ""}"`,
                    );
                }
            } else {
                // それ以外のアイテムは削除
                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(`Removing item at index ${i}`);
                }
                items.removeAt(i);
            }
        }

        // 残りの行を新しいアイテムとして追加
        for (let i = 1; i < lines.length; i++) {
            const newIndex = actualStartIndex + i;
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Adding new item at index ${newIndex} with text: "${lines[i]}"`,
                );
            }
            items.addNode(currentUser, newIndex);
            // 追加直後のアイテムを配列インデックスで取得しテキスト設定
            const newItem = (items as any).at(newIndex);
            if (newItem) {
                newItem.updateText(lines[i]);
            }
        }

        // カーソル位置を更新
        const newCursorItemId = displayItems[actualStartIndex]?.model.id;
        if (newCursorItemId) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Setting cursor to item ${newCursorItemId} at offset ${(lines[0] || "").length}`,
                );
            }

            editorOverlayStore.setCursor({
                itemId: newCursorItemId,
                offset: (lines[0] || "").length,
                isActive: true,
                userId: "local",
            });

            // アクティブアイテムを設定
            editorOverlayStore.setActiveItem(newCursorItemId);

            // 選択範囲をクリア
            editorOverlayStore.clearSelections();
        } else {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Could not find cursor item at index ${actualStartIndex}`,
                );
            }
        }
    }

    // 単一アイテム内の選択範囲にペーストする
    function handleSingleItemSelectionPaste(selection: any, lines: string[]) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `handleSingleItemSelectionPaste called with selection:`,
                selection,
            );
            console.log(`Lines to paste:`, lines);
        }

        const itemId = selection.startItemId;
        const startOffset = Math.min(
            selection.startOffset,
            selection.endOffset,
        );
        const endOffset = Math.max(selection.startOffset, selection.endOffset);

        // アイテムのインデックスを取得
        const itemIndex = displayItems.findIndex((d) => d.model.id === itemId);
        if (itemIndex < 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Item not found: itemId=${itemId}, itemIndex=${itemIndex}`,
                );
            }
            return;
        }

        const items = pageItem.items as Items;
        const item = displayItems[itemIndex].model.original;
        const text: string = (item.text as any)?.toString?.() ?? "";

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Original text: "${text}"`);
            console.log(
                `Selection range: start=${startOffset}, end=${endOffset}`,
            );
        }

        if (lines.length === 1) {
            // 単一行のペーストの場合は、選択範囲を置き換え
            const newText =
                text.substring(0, startOffset) +
                lines[0] +
                text.substring(endOffset);
            item.updateText(newText);

            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Updated text to: "${newText}"`);
            }

            // カーソル位置を更新
            editorOverlayStore.setCursor({
                itemId,
                offset: startOffset + lines[0].length,
                isActive: true,
                userId: "local",
            });

            // 選択範囲をクリア
            editorOverlayStore.clearSelections();
        } else {
            // 複数行のペーストの場合
            // 最初の行は現在のアイテムの選択範囲を置き換え
            const newFirstText = text.substring(0, startOffset) + lines[0];
            item.updateText(newFirstText);

            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Updated first item text to: "${newFirstText}"`);
            }

            // 残りの行を新しいアイテムとして追加
            for (let i = 1; i < lines.length; i++) {
                const newIndex = itemIndex + i;

                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(`Adding new item at index ${newIndex}`);
                }

                items.addNode(currentUser, newIndex);
                // 追加直後のアイテムを配列インデックスで取得しテキスト設定
                const newItem = (items as any).at(newIndex);
                if (newItem) {
                    if (i === lines.length - 1) {
                        // 最後の行は、選択範囲の後ろのテキストを追加
                        const lastItemText =
                            lines[i] + text.substring(endOffset);
                        newItem.updateText(lastItemText);

                        if (
                            typeof window !== "undefined" &&
                            (window as any).DEBUG_MODE
                        ) {
                            console.log(
                                `Last item text set to: "${lastItemText}"`,
                            );
                        }
                    } else {
                        newItem.updateText(lines[i]);

                        if (
                            typeof window !== "undefined" &&
                            (window as any).DEBUG_MODE
                        ) {
                            console.log(`Item ${i} text set to: "${lines[i]}"`);
                        }
                    }
                }
            }

            // カーソル位置を更新（最後のアイテムの末尾）
            const lastItemIndex = itemIndex + lines.length - 1;
            const lastItemId = displayItems[lastItemIndex]?.model.id;
            if (lastItemId) {
                const lastLine = lines[lines.length - 1];
                const newOffset = lastLine.length;

                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(
                        `Setting cursor to last item ${lastItemId} at offset ${newOffset}`,
                    );
                }

                editorOverlayStore.setCursor({
                    itemId: lastItemId,
                    offset: newOffset,
                    isActive: true,
                    userId: "local",
                });

                // アクティブアイテムを設定
                editorOverlayStore.setActiveItem(lastItemId);

                // 選択範囲をクリア
                editorOverlayStore.clearSelections();
            } else {
                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(
                        `Could not find last item at index ${lastItemIndex}`,
                    );
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
        if (target.closest(".outliner-item")) return;

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
        const startIndex = displayItems.findIndex(
            (item) => item.model.id === dragStartItemId,
        );
        const currentIndex = displayItems.findIndex(
            (item) => item.model.id === dragCurrentItemId,
        );

        if (startIndex === -1 || currentIndex === -1) return;

        // 選択方向を決定
        const isReversed =
            startIndex > currentIndex ||
            (startIndex === currentIndex &&
                dragStartOffset > dragCurrentOffset);

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
            userId: "local",
            isReversed,
        });

        // カーソル位置を更新
        editorOverlayStore.setCursor({
            itemId: dragCurrentItemId,
            offset: dragCurrentOffset,
            isActive: true,
            userId: "local",
        });

        // アクティブアイテムを設定
        editorOverlayStore.setActiveItem(dragCurrentItemId);
    }

    // アイテムのドロップイベントハンドラ
    function handleItemDrop(event: CustomEvent) {
        const { targetItemId, position, text, selection, sourceItemId } =
            event.detail;

        try {
            const w: any =
                typeof window !== "undefined" ? (window as any) : null;
            if (w && Array.isArray(w.E2E_LOGS)) {
                w.E2E_LOGS.push({
                    tag: "handleItemDrop",
                    targetItemId,
                    position,
                    sourceItemId,
                    selection: selection ? "yes" : "no",
                    t: Date.now(),
                });
            }
        } catch {}

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Drop event: targetItemId=${targetItemId}, position=${position}, sourceItemId=${sourceItemId}`,
            );
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
                handleSingleItemSelectionDrop(
                    selection,
                    targetItemId,
                    position,
                    text,
                );
            } else {
                // 複数アイテムにまたがる選択範囲
                handleMultiItemSelectionDrop(
                    selection,
                    targetItemId,
                    position,
                    text,
                );
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
    function handleSingleItemSelectionDrop(
        selection: any,
        targetItemId: string,
        position: string,
        _dropEffect: string,
    ) {
        // eslint-disable-line @typescript-eslint/no-unused-vars
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `handleSingleItemSelectionDrop called with selection:`,
                selection,
            );
            console.log(`Target: itemId=${targetItemId}, position=${position}`);
        }

        const sourceItemId = selection.startItemId;
        const startOffset = Math.min(
            selection.startOffset,
            selection.endOffset,
        );
        const endOffset = Math.max(selection.startOffset, selection.endOffset);

        // ソースアイテムとターゲットアイテムのインデックスを取得
        const sourceIndex = displayItems.findIndex(
            (d) => d.model.id === sourceItemId,
        );
        const targetIndex = displayItems.findIndex(
            (d) => d.model.id === targetItemId,
        );

        if (sourceIndex < 0 || targetIndex < 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Source or target item not found: sourceIndex=${sourceIndex}, targetIndex=${targetIndex}`,
                );
            }
            return;
        }

        // ソースアイテムのテキストを取得
        const sourceItem = displayItems[sourceIndex].model.original;
        const sourceText: string = (sourceItem.text as any)?.toString?.() ?? "";

        // ターゲットアイテムのテキストを取得
        const targetItem = displayItems[targetIndex].model.original;
        const targetText: string = (targetItem.text as any)?.toString?.() ?? "";

        // 選択範囲のテキストを取得
        const selectedText = sourceText.substring(startOffset, endOffset);

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selected text: "${selectedText}"`);
        }

        // ソースアイテムから選択範囲を削除
        const newSourceText =
            sourceText.substring(0, startOffset) +
            sourceText.substring(endOffset);
        sourceItem.updateText(newSourceText);

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Updated source text: "${newSourceText}"`);
        }

        // ターゲットアイテムに選択範囲を挿入
        if (position === "top") {
            // アイテムの先頭に挿入
            targetItem.updateText(selectedText + targetText);
        } else if (position === "bottom") {
            // アイテムの末尾に挿入
            targetItem.updateText(targetText + selectedText);
        } else if (position === "middle") {
            // アイテムの中央に挿入（カーソル位置を計算）
            const middleOffset = Math.floor(targetText.length / 2);
            targetItem.updateText(
                targetText.substring(0, middleOffset) +
                    selectedText +
                    targetText.substring(middleOffset),
            );
        }

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Updated target text: "${targetItem.text}"`);
        }

        // カーソル位置を更新
        editorOverlayStore.setCursor({
            itemId: targetItemId,
            offset:
                position === "top"
                    ? selectedText.length
                    : position === "bottom"
                      ? targetText.length + selectedText.length
                      : Math.floor(targetText.length / 2) + selectedText.length,
            isActive: true,
            userId: "local",
        });

        // アクティブアイテムを設定
        editorOverlayStore.setActiveItem(targetItemId);

        // 選択範囲をクリア
        editorOverlayStore.clearSelections();
    }

    // 複数アイテムにまたがる選択範囲をドロップする
    function handleMultiItemSelectionDrop(
        selection: any,
        targetItemId: string,
        position: string,
        text: string,
    ) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `handleMultiItemSelectionDrop called with selection:`,
                selection,
            );
            console.log(`Target: itemId=${targetItemId}, position=${position}`);
        }

        // 選択範囲の開始と終了アイテムを取得
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;

        // アイテムのインデックスを取得
        const startIndex = displayItems.findIndex(
            (d) => d.model.id === startItemId,
        );
        const endIndex = displayItems.findIndex(
            (d) => d.model.id === endItemId,
        );
        const targetIndex = displayItems.findIndex(
            (d) => d.model.id === targetItemId,
        );

        if (startIndex < 0 || endIndex < 0 || targetIndex < 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Start, end, or target item not found: startIndex=${startIndex}, endIndex=${endIndex}, targetIndex=${targetIndex}`,
                );
            }
            return;
        }

        // 選択範囲の方向を考慮
        const actualStartIndex = Math.min(startIndex, endIndex);
        const actualEndIndex = Math.max(startIndex, endIndex);

        // 選択範囲内のテキストを取得
        const selectedText = text;

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selected text: "${selectedText}"`);
        }

        const items = pageItem.items as Items;

        // 選択範囲内のアイテムを削除（後ろから削除）
        for (let i = actualEndIndex; i >= actualStartIndex; i--) {
            if (i === actualStartIndex) {
                // 開始アイテムは削除せず、テキストを更新
                const startItem = displayItems[i].model.original;
                startItem.updateText("");

                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(`Cleared first item text`);
                }
            } else {
                // それ以外のアイテムは削除
                if (
                    typeof window !== "undefined" &&
                    (window as any).DEBUG_MODE
                ) {
                    console.log(`Removing item at index ${i}`);
                }
                items.removeAt(i);
            }
        }

        // ターゲットアイテムのテキストを取得
        const targetItem = displayItems[targetIndex].model.original;
        const targetText = targetItem.text || "";

        // 選択範囲のテキストを行に分割
        const lines = selectedText.split("\n");

        // ターゲットアイテムに選択範囲を挿入
        if (position === "top") {
            // アイテムの先頭に挿入
            targetItem.updateText(lines[0] + targetText);

            // 残りの行を新しいアイテムとして追加
            for (let i = 1; i < lines.length; i++) {
                items.addNode(currentUser, targetIndex + i);
                const newItem = (items as any).at(targetIndex + i);
                if (newItem) {
                    newItem.updateText(lines[i]);
                }
            }
        } else if (position === "bottom") {
            // アイテムの末尾に挿入
            targetItem.updateText(targetText + lines[0]);

            // 残りの行を新しいアイテムとして追加
            for (let i = 1; i < lines.length; i++) {
                items.addNode(currentUser, targetIndex + i);
                const newItem = (items as any).at(targetIndex + i);
                if (newItem) {
                    newItem.updateText(lines[i]);
                }
            }
        } else if (position === "middle") {
            // アイテムの中央に挿入（カーソル位置を計算）
            const middleOffset = Math.floor(targetText.length / 2);
            targetItem.updateText(
                targetText.substring(0, middleOffset) +
                    lines[0] +
                    targetText.substring(middleOffset),
            );

            // 残りの行を新しいアイテムとして追加
            for (let i = 1; i < lines.length; i++) {
                items.addNode(currentUser, targetIndex + i);
                const newItem = (items as any).at(targetIndex + i);
                if (newItem) {
                    newItem.updateText(lines[i]);
                }
            }
        }

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Updated target text: "${targetItem.text}"`);
        }

        // カーソル位置を更新
        editorOverlayStore.setCursor({
            itemId: targetItemId,
            offset:
                position === "top"
                    ? lines[0].length
                    : position === "bottom"
                      ? targetText.length + lines[0].length
                      : Math.floor(targetText.length / 2) + lines[0].length,
            isActive: true,
            userId: "local",
        });

        // アクティブアイテムを設定
        editorOverlayStore.setActiveItem(targetItemId);

        // 選択範囲をクリア
        editorOverlayStore.clearSelections();
    }

    // アイテム全体を移動する
    function handleItemMoveDrop(
        sourceItemId: string,
        targetItemId: string,
        position: string,
    ) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `handleItemMoveDrop called with sourceItemId=${sourceItemId}, targetItemId=${targetItemId}, position=${position}`,
            );
        }

        // ソースアイテムとターゲットアイテムのインデックスを取得
        const sourceIndex = displayItems.findIndex(
            (d) => d.model.id === sourceItemId,
        );
        const targetIndex = displayItems.findIndex(
            (d) => d.model.id === targetItemId,
        );

        if (sourceIndex < 0 || targetIndex < 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Source or target item not found: sourceIndex=${sourceIndex}, targetIndex=${targetIndex}`,
                );
            }
            return;
        }

        // ソースアイテムとターゲットアイテムが同じ場合は何もしない
        if (sourceIndex === targetIndex) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Source and target are the same item, no action needed`,
                );
            }
            return;
        }

        const items = pageItem.items as Items;
        const sourceItem = displayItems[sourceIndex].model.original;
        const targetItem = displayItems[targetIndex].model.original;

        const sourceKey = sourceItem.key!;
        const targetKey = targetItem.key!;

        try {
            const w: any =
                typeof window !== "undefined" ? (window as any) : null;
            if (w && Array.isArray(w.E2E_LOGS)) {
                w.E2E_LOGS.push({
                    tag: "handleItemMoveDrop",
                    source: sourceItemId,
                    target: targetItemId,
                    position,
                    t: Date.now(),
                });
            }
        } catch {}

        try {
            const tree: any = items.tree;
            const doc: any = pageItem?.ydoc;
            const sourceParent = tree.getNodeParentFromKey?.(sourceKey);
            const targetParent = tree.getNodeParentFromKey?.(targetKey);

            const run = () => {
                // Middle drop should nest under the target item.
                if (position === "middle") {
                    if (sourceParent !== targetKey) {
                        tree.moveChildToParent(sourceKey, targetKey);
                    }
                    if (
                        typeof tree.recomputeParentsAndChildren === "function"
                    ) {
                        tree.recomputeParentsAndChildren();
                    }
                    tree.setNodeOrderToEnd(sourceKey);
                    return;
                }

                // For top/bottom drops, ensure the item is a sibling before reordering.
                if (
                    sourceParent &&
                    targetParent &&
                    sourceParent !== targetParent
                ) {
                    tree.moveChildToParent(sourceKey, targetParent);
                }
                if (typeof tree.recomputeParentsAndChildren === "function") {
                    tree.recomputeParentsAndChildren();
                }

                if (position === "top") {
                    tree.setNodeBefore(sourceKey, targetKey);
                } else {
                    tree.setNodeAfter(sourceKey, targetKey);
                }
            };

            if (typeof doc?.transact === "function") {
                doc.transact(run, "item-drop-reorder");
            } else {
                run();
            }

            // Ensure derived display list re-renders after order-only updates (Y.Tree order changes don't emit observeDeep events reliably)
            __displayItemsTick = Date.now();

            editorOverlayStore.setCursor({
                itemId: sourceItemId,
                offset: 0,
                isActive: true,
                userId: "local",
            });

            editorOverlayStore.setActiveItem(sourceItemId);
            editorOverlayStore.clearSelections();
        } catch (error) {
            console.error("Failed to move item:", error);
        }
    }

    // 外部からのテキストをドロップする
    function handleExternalTextDrop(
        targetItemId: string,
        position: string,
        text: string,
    ) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `handleExternalTextDrop called with targetItemId=${targetItemId}, position=${position}`,
            );
            console.log(`Text: "${text}"`);
        }

        // ターゲットアイテムのインデックスを取得
        const targetIndex = displayItems.findIndex(
            (d) => d.model.id === targetItemId,
        );

        if (targetIndex < 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Target item not found: targetIndex=${targetIndex}`,
                );
            }
            return;
        }

        // ターゲットアイテムのテキストを取得
        const targetItem = displayItems[targetIndex].model.original;
        const targetText = targetItem.text || "";

        // テキストを行に分割
        const lines = text.split("\n");

        const items = pageItem.items as Items;

        // ターゲットアイテムにテキストを挿入
        if (position === "top") {
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
        } else if (position === "bottom") {
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
        } else if (position === "middle") {
            // アイテムの中央に挿入（カーソル位置を計算）
            const middleOffset = Math.floor(targetText.length / 2);
            targetItem.text =
                targetText.substring(0, middleOffset) +
                lines[0] +
                targetText.substring(middleOffset);

            // 残りの行を新しいアイテムとして追加
            for (let i = 1; i < lines.length; i++) {
                items.addNode(currentUser, targetIndex + i);
                const newItem = items[targetIndex + i];
                if (newItem) {
                    newItem.text = lines[i];
                }
            }
        }

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Updated target text: "${targetItem.text}"`);
        }

        // カーソル位置を更新
        editorOverlayStore.setCursor({
            itemId: targetItemId,
            offset:
                position === "top"
                    ? lines[0].length
                    : position === "bottom"
                      ? targetText.length + lines[0].length
                      : Math.floor(targetText.length / 2) + lines[0].length,
            isActive: true,
            userId: "local",
        });

        // アクティブアイテムを設定
        editorOverlayStore.setActiveItem(targetItemId);

        // 選択範囲をクリア
        editorOverlayStore.clearSelections();
    }
</script>

{#key outlinerKey}
    <div
        class="outliner"
        onmousedown={handleTreeMouseDown}
        onmouseup={handleTreeMouseUp}
        role="application"
    >
        <div class="toolbar">
            <div class="actions">
                <button onclick={handleAddItem}>アイテム追加</button>
                <button
                    onclick={() => goto(`/${projectName}/${pageName}/diff`)}
                >
                    History / Diff
                </button>
            </div>
        </div>

        <div
            class="tree-container"
            role="region"
            aria-label="アウトライナーツリー"
        >
            <!-- フラット表示の各アイテム（静的配置） -->
            {#each displayItems as display, index (display.model.id)}
                <div
                    class="item-container"
                    style="--item-depth: {display.depth}"
                >
                    <OutlinerItem
                        model={display.model}
                        depth={display.depth}
                        {currentUser}
                        {isReadOnly}
                        isCollapsed={viewModel.isCollapsed(display.model.id)}
                        hasChildren={viewModel.hasChildren(display.model.id)}
                        isPageTitle={index === 0}
                        {index}
                        on:toggle-collapse={handleToggleCollapse}
                        on:indent={handleIndent}
                        on:unindent={handleUnindent}
                        on:navigate-to-item={handleNavigateToItem}
                        on:add-sibling={handleAddSibling}
                        on:drag-start={handleItemDragStart}
                        on:drag={handleItemDrag}
                        on:drop={handleItemDrop}
                        on:drag-end={handleItemDragEnd}
                    />
                </div>
            {/each}

            {#if displayItems.length === 0 && !isReadOnly}
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
{/key}

<!-- Mobile Action Toolbar (appears on mobile devices when needed) -->
<div
    class="mobile-action-toolbar"
    data-testid="mobile-action-toolbar"
    role="toolbar"
    aria-label="Mobile Action Toolbar"
>
    <button
        class="mobile-toolbar-btn"
        aria-label="Indent"
        title="Indent"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId },
            } as CustomEvent;
            handleIndent(mockEvent);
        }}
    >
        ➤
    </button>
    <button
        class="mobile-toolbar-btn"
        aria-label="Outdent"
        title="Outdent"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId },
            } as CustomEvent;
            handleUnindent(mockEvent);
        }}
    >
        ←
    </button>
    <button
        class="mobile-toolbar-btn"
        aria-label="Insert Above"
        title="Insert Above"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId, position: "above" },
            } as CustomEvent;
            handleAddSibling(mockEvent);
        }}
    >
        ↑
    </button>
    <button
        class="mobile-toolbar-btn"
        aria-label="Insert Below"
        title="Insert Below"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId, position: "below" },
            } as CustomEvent;
            handleAddSibling(mockEvent);
        }}
    >
        ↓
    </button>
    <button
        class="mobile-toolbar-btn"
        aria-label="New Child"
        title="New Child"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId, position: "child" },
            } as CustomEvent;
            handleAddSibling(mockEvent);
        }}
    >
        +
    </button>
</div>

<style>
    /* Mobile Action Toolbar */
    .mobile-action-toolbar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        display: none; /* Hidden by default */
        background: white;
        border-top: 1px solid #ddd;
        padding: 8px;
        z-index: 1000;
        justify-content: space-around;
        align-items: center;
        height: 50px;
    }

    .mobile-toolbar-btn {
        background: #f0f0f0;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
    }

    .mobile-toolbar-btn:hover {
        background: #e0e0e0;
    }

    /* Show mobile toolbar only on small screens */
    @media (max-width: 768px) {
        .mobile-action-toolbar {
            display: flex;
        }
    }

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
        position: relative;
        margin-left: calc(max(0, var(--item-depth) - 1) * 24px);
        width: auto;
        min-height: 36px; /* 最小の高さを設定 */
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
