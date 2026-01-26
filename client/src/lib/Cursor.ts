import type { Item } from "../schema/app-schema";
import type { SelectionRange } from "../stores/EditorOverlayStore.svelte";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";
import {
    findNextItem,
    findPreviousItem,
    getCurrentColumn,
    getCurrentLineIndex,
    getLineEndOffset,
    getLineStartOffset,
    getSelectionForUser,
    getVisualLineInfo,
    getVisualLineOffsetRange,
    hasSelection as storeHasSelection,
    searchItem,
    selectionSpansMultipleItems,
} from "./cursor";
import { type CursorEditingContext, CursorEditor } from "./cursor/CursorEditor";

interface CursorOptions {
    itemId: string;
    offset: number;
    isActive: boolean;
    userId: string;
}

export class Cursor implements CursorEditingContext {
    cursorId: string;
    itemId: string;
    offset: number;
    isActive: boolean;
    userId: string;
    // 上下キー操作時に使用する初期列位置
    private readonly editor: CursorEditor;
    private initialColumn: number | null = null;

    private getSelection() {
        return getSelectionForUser(this.userId);
    }

    private hasSelection() {
        return storeHasSelection(this.userId);
    }

    private getSelectionForCurrentItem() {
        const selection = this.getSelection();
        if (!selection) return undefined;
        if (selection.startItemId === this.itemId || selection.endItemId === this.itemId) {
            return selection;
        }
        return undefined;
    }

    constructor(cursorId: string, opts: CursorOptions) {
        this.cursorId = cursorId;
        this.itemId = opts.itemId;
        this.offset = opts.offset;
        this.isActive = opts.isActive;
        this.userId = opts.userId;
        this.editor = new CursorEditor(this as any);
    }

    // SharedTree 上の Item を再帰検索
    private _findTarget(): Item | undefined {
        const root = generalStore.currentPage as Item | undefined;
        if (root) {
            const found = searchItem(root as any, this.itemId) as Item | undefined;
            if (found) return found;
        }
        // Fallback: search across all pages in the current project
        try {
            const proj: { items?: Iterable<Item>; } | undefined = (generalStore as any).project;
            const pages: Iterable<Item> | undefined = proj?.items;
            if (pages && pages[Symbol.iterator]) {
                for (const p of pages) {
                    const f = searchItem(p as any, this.itemId) as Item | undefined;
                    if (f) return f;
                }
            }
        } catch {}
        if (typeof window !== "undefined") {
            console.debug("findTarget: not found", { itemId: this.itemId, rootId: root?.id });
        }
        return undefined;
    }

    // SharedTree 上の Item を再帰検索 (CursorEditingContext interface implementation)
    findTarget(): any {
        return this._findTarget();
    }

    private getTargetText(target: Item | undefined): string {
        const raw = target?.text;
        if (typeof raw === "string") return raw;
        if (raw && typeof (raw as any).toString === "function") {
            try {
                return (raw as any).toString();
            } catch {}
        }
        return raw == null ? "" : String(raw);
    }

    applyToStore() {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Cursor.applyToStore called for cursorId=${this.cursorId}, itemId=${this.itemId}, offset=${this.offset}`,
            );
        }

        // 既存のカーソルを更新
        store.updateCursor({
            cursorId: this.cursorId,
            itemId: this.itemId,
            offset: this.offset,
            isActive: this.isActive,
            userId: this.userId,
        });

        // カーソルインスタンスが存在しない場合は新しく作成
        const inst = store.cursorInstances.get(this.cursorId);
        if (!inst) {
            const cursorId = store.setCursor({
                itemId: this.itemId,
                offset: this.offset,
                isActive: this.isActive,
                userId: this.userId,
            });
            this.cursorId = cursorId;
        }

        // アクティブアイテムを設定
        if (this.isActive) {
            store.setActiveItem(this.itemId);

            // グローバルテキストエリアにフォーカスを設定
            const textarea = store.getTextareaRef();
            if (textarea) {
                // フォーカスを確実に設定するための複数の試行
                textarea.focus();

                // requestAnimationFrameを使用してフォーカスを設定
                requestAnimationFrame(() => {
                    textarea.focus();

                    // さらに確実にするためにsetTimeoutも併用
                    setTimeout(() => {
                        textarea.focus();

                        // デバッグ情報
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.log(
                                `Cursor.applyToStore: Focus set. Active element is textarea: ${
                                    document.activeElement === textarea
                                }`,
                            );
                        }
                    }, 10);
                });
            } else {
                // テキストエリアが見つからない場合はエラーログ
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.error(`Cursor.applyToStore: Global textarea not found`);
                }
            }
        }
    }

    // 上下キー以外の操作が行われたときに初期列位置をリセット
    private resetInitialColumn() {
        this.initialColumn = null;
    }

    moveLeft() {
        // 上下キー以外の操作なので初期列位置をリセット
        this.resetInitialColumn();

        const target = this.findTarget();
        if (!target) return;

        if (this.offset > 0) {
            this.offset = Math.max(0, this.offset - 1);
            this.applyToStore();

            // カーソルが正しく更新されたことを確認
            store.startCursorBlink();
        } else {
            // 行頭で前アイテムへ移動
            this.navigateToItem("left");
        }
    }

    moveRight() {
        // 上下キー以外の操作なので初期列位置をリセット
        this.resetInitialColumn();

        const target = this.findTarget();
        const text = this.getTargetText(target);

        // If at or beyond the end of the current item, find next item directly in DOM
        if (text.length > 0 && this.offset >= text.length) {
            // Try to find the next item directly in the DOM first
            if (typeof document !== "undefined") {
                const currentItemElement = document.querySelector(`[data-item-id="${this.itemId}"]`);
                if (currentItemElement) {
                    const allItems = Array.from(document.querySelectorAll("[data-item-id]"));
                    const currentIndex = allItems.indexOf(currentItemElement);
                    if (currentIndex !== -1 && currentIndex < allItems.length - 1) {
                        const nextElement = allItems[currentIndex + 1] as HTMLElement;
                        const nextItemId = nextElement.getAttribute("data-item-id");

                        if (nextItemId && nextItemId !== this.itemId) {
                            // Set the new item and offset
                            this.itemId = nextItemId;
                            this.offset = 0;

                            // Update the store to reflect the changes
                            this.applyToStore();

                            // カーソル点滅を開始
                            store.startCursorBlink();

                            // Exit early since we've manually handled the navigation
                            return;
                        }
                    }
                }
            }

            // Fallback to navigateToItem if DOM approach didn't work
            this.navigateToItem("right");
        } else if (text.length > 0 && this.offset < text.length) {
            // Within the current item, just move the cursor right by one position
            this.offset = this.offset + 1;
            this.applyToStore();

            // カーソルが正しく更新されたことを確認
            store.startCursorBlink();
        } else {
            // Empty text case - try to move to next item
            this.navigateToItem("right");
        }
    }

    moveToLineStart() {
        this.resetInitialColumn();
        const target = this.findTarget();
        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const lineStartOffset = getLineStartOffset(text, currentLineIndex);
        this.offset = lineStartOffset;
        this.applyToStore();
        store.startCursorBlink();
    }

    moveToLineEnd() {
        this.resetInitialColumn();
        const target = this.findTarget();
        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const lineEndOffset = getLineEndOffset(text, currentLineIndex);
        this.offset = lineEndOffset;
        this.applyToStore();
        store.startCursorBlink();
    }

    moveUp() {
        const target = this.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`moveUp called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // 視覚的な行の情報を取得
        const visualLineInfo = getVisualLineInfo(this.itemId, this.offset);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // フォールバック: 論理的な行での処理（改行文字ベース）
            const text = this.getTargetText(target);
            const currentLineIndex = getCurrentLineIndex(text, this.offset);
            if (currentLineIndex > 0) {
                const prevLineStart = getLineStartOffset(text, currentLineIndex - 1);
                this.offset = prevLineStart;
                this.applyToStore();
                store.startCursorBlink();
            } else {
                this.navigateToItem("up");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // 現在の列位置を計算（視覚的な行内での位置）
        const currentColumn = this.offset - lineStartOffset;

        // 初期列位置を設定または更新
        if (this.initialColumn === null) {
            this.initialColumn = currentColumn;
        }

        // 使用する列位置（初期列位置）
        const targetColumn = this.initialColumn;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex > 0) {
            // 同じアイテム内の上の視覚的な行に移動
            const prevLineRange = getVisualLineOffsetRange(this.itemId, lineIndex - 1);
            if (prevLineRange) {
                const prevLineLength = prevLineRange.endOffset - prevLineRange.startOffset;
                // 初期列位置か行の長さの短い方に移動
                this.offset = prevLineRange.startOffset + Math.min(targetColumn, prevLineLength);
                this.applyToStore();

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Moved to previous visual line in same item: offset=${this.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // カーソル点滅を開始
                store.startCursorBlink();
            }
        } else {
            // 前のアイテムを探す
            const prevItem = findPreviousItem(this.itemId);
            // Also check for parent item when there's no previous sibling
            // Note: item.parent returns Items (collection), not Item. We need to find the parent Item.
            const currentTarget = this.findTarget();
            const parentCollection = currentTarget?.parent;
            // Get the parent Item by creating it from parentKey
            let parentItemInstance: any = null;
            if (!prevItem && parentCollection && parentCollection.parentKey && parentCollection.parentKey !== "root") {
                // Create the parent Item from the parentKey
                parentItemInstance = new (currentTarget!.constructor as any)(
                    currentTarget!.ydoc,
                    currentTarget!.tree,
                    parentCollection.parentKey,
                );
            }
            const hasParentToNavigateTo = !prevItem && parentItemInstance && parentItemInstance.id;

            if (prevItem || hasParentToNavigateTo) {
                // 前のアイテムまたは親アイテムに移動
                // navigateToItem("up") will handle both cases
                this.navigateToItem("up");

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moved to previous item: itemId=${this.itemId}, offset=${this.offset}`);
                }
            } else {
                // 前のアイテムも親アイテムもない場合は、同じアイテムの先頭に移動
                if (this.offset > 0) {
                    this.offset = 0;
                    this.applyToStore();

                    // カーソルが正しく更新されたことを確認
                    store.startCursorBlink();

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Moved to start of current item: offset=${this.offset}`);
                    }
                }
            }
        }
    }

    moveDown() {
        const target = this.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`moveDown called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // 視覚的な行の情報を取得
        const visualLineInfo = getVisualLineInfo(this.itemId, this.offset);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // フォールバック: 論理的な行での処理（改行文字ベース）
            const text = this.getTargetText(target);
            const lines = text.split("\n");
            const currentLineIndex = getCurrentLineIndex(text, this.offset);
            if (currentLineIndex < lines.length - 1) {
                const nextLineStart = getLineStartOffset(text, currentLineIndex + 1);
                this.offset = nextLineStart;
                this.applyToStore();
                store.startCursorBlink();
            } else {
                this.navigateToItem("down");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // 現在の列位置を計算（視覚的な行内での位置）
        const currentColumn = this.offset - lineStartOffset;

        // 初期列位置を設定または更新
        if (this.initialColumn === null) {
            this.initialColumn = currentColumn;
        }

        // 使用する列位置（初期列位置）
        const targetColumn = this.initialColumn;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex < totalLines - 1) {
            // 同じアイテム内の下の視覚的な行に移動
            const nextLineRange = getVisualLineOffsetRange(this.itemId, lineIndex + 1);
            if (nextLineRange) {
                const nextLineLength = nextLineRange.endOffset - nextLineRange.startOffset;
                // 初期列位置か行の長さの短い方に移動
                this.offset = nextLineRange.startOffset + Math.min(targetColumn, nextLineLength);
                this.applyToStore();

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Moved to next visual line in same item: offset=${this.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // カーソル点滅を開始
                store.startCursorBlink();
            }
        } else {
            // 次のアイテムを探す
            const nextItem = findNextItem(this.itemId);
            if (nextItem) {
                // 次のアイテムの最初の視覚的な行に移動
                this.navigateToItem("down");

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moved to next item: itemId=${this.itemId}, offset=${this.offset}`);
                }
            } else {
                // 次のアイテムがない場合は、同じアイテムの末尾に移動
                const text = this.getTargetText(target);
                if (this.offset < text.length) {
                    this.offset = text.length;
                    this.applyToStore();

                    // カーソルが正しく更新されたことを確認
                    store.startCursorBlink();

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Moved to end of current item: offset=${this.offset}`);
                    }
                }
            }
        }
    }

    /**
     * テキストを挿入する
     * @param ch 挿入するテキスト
     */
    insertText(ch: string) {
        this.resetInitialColumn();
        this.editor.insertText(ch);
    }

    /**
     * カーソル位置の前の文字を削除する
     */
    deleteBackward() {
        this.resetInitialColumn();
        this.editor.deleteBackward();
    }

    /**
     * カーソル位置の後の文字を削除する
     */
    deleteForward() {
        this.resetInitialColumn();
        this.editor.deleteForward();
    }

    deleteMultiItemSelection(selection: SelectionRange) {
        this.editor.deleteMultiItemSelection(selection);
    }

    insertLineBreak() {
        this.editor.insertLineBreak();
    }

    onInput(event: InputEvent) {
        this.editor.onInput(event);
    }

    /**
     * キーボードイベントを処理する
     * @param event キーボードイベント
     * @returns イベントを処理したかどうか
     */
    onKeyDown(event: KeyboardEvent): boolean {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`onKeyDown called with key=${event.key}, ctrlKey=${event.ctrlKey}, shiftKey=${event.shiftKey}`);
        }

        // 選択範囲の有無を確認
        const hasSelection = this.hasSelection();
        const activeSelection = hasSelection ? this.getSelection() : undefined;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Has selection: ${hasSelection}`);
            if (activeSelection) {
                console.log(`Selections:`, [activeSelection]);
            }
        }

        // Ctrl/Cmd キーが押されている場合は特殊操作
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case "a":
                case "A":
                    this.selectAll();
                    break;
                case "c":
                case "C":
                    this.copySelectedText();
                    return true;
                case "x":
                case "X":
                    this.cutSelectedText();
                    return true;
                case "v":
                case "V":
                    // ペースト処理はブラウザのデフォルト動作に任せる
                    return false;
                case "ArrowLeft":
                    this.moveWordLeft();
                    break;
                case "ArrowRight":
                    this.moveWordRight();
                    break;
                case "ArrowUp":
                    this.scrollUp();
                    break;
                case "ArrowDown":
                    this.scrollDown();
                    break;
                case "Home":
                    this.moveToDocumentStart();
                    break;
                case "End":
                    this.moveToDocumentEnd();
                    break;
                case "PageUp":
                    this.pageUp();
                    break;
                case "PageDown":
                    this.pageDown();
                    break;
                case "\\":
                    if (event.shiftKey) {
                        this.jumpToMatchingBracket();
                        break;
                    } else {
                        return false;
                    }
                default:
                    return false;
            }
        } // Shift キーが押されている場合は選択範囲を拡張
        else if (event.shiftKey) {
            switch (event.key) {
                case "ArrowLeft":
                    this.extendSelectionLeft();
                    break;
                case "ArrowRight":
                    this.extendSelectionRight();
                    break;
                case "ArrowUp":
                    this.extendSelectionUp();
                    break;
                case "ArrowDown":
                    this.extendSelectionDown();
                    break;
                case "Home":
                    this.extendSelectionToLineStart();
                    break;
                case "End":
                    this.extendSelectionToLineEnd();
                    break;
                case "Enter":
                    this.insertLineBreak();
                    break;
                default:
                    return false;
            }
        } else {
            // 通常のカーソル移動
            switch (event.key) {
                case "ArrowLeft":
                    if (hasSelection) {
                        // 選択範囲がある場合は、選択範囲の開始位置にカーソルを移動して選択範囲をクリア
                        this.clearSelection();
                    } else {
                        this.moveLeft();
                    }
                    break;
                case "ArrowRight":
                    if (hasSelection) {
                        // 選択範囲がある場合は、選択範囲の終了位置にカーソルを移動して選択範囲をクリア
                        this.clearSelection();
                    } else {
                        this.moveRight();
                    }
                    break;
                case "ArrowUp":
                    if (hasSelection) {
                        // 選択範囲がある場合は、選択範囲をクリアしてから移動
                        this.clearSelection();
                    }
                    this.moveUp();
                    break;
                case "ArrowDown":
                    if (hasSelection) {
                        // 選択範囲がある場合は、選択範囲をクリアしてから移動
                        this.clearSelection();
                    }
                    this.moveDown();
                    break;
                case "Home":
                    if (hasSelection) {
                        // 選択範囲がある場合は、選択範囲をクリアしてから移動
                        this.clearSelection();
                    }
                    this.moveToLineStart();
                    break;
                case "End":
                    if (hasSelection) {
                        // 選択範囲がある場合は、選択範囲をクリアしてから移動
                        this.clearSelection();
                    }
                    this.moveToLineEnd();
                    break;
                case "Backspace":
                    // 選択範囲がある場合は、選択範囲を削除
                    if (hasSelection) {
                        const selection = this.getSelection();
                        if (selection) {
                            // 複数アイテムにまたがる選択範囲の場合
                            if (selectionSpansMultipleItems(selection)) {
                                this.deleteMultiItemSelection(selection);
                            } else {
                                // 単一アイテム内の選択範囲の場合
                                this.deleteSelection();
                            }
                        }
                    } else {
                        // 通常のBackspace処理
                        this.deleteBackward();
                    }
                    break;
                case "Delete":
                    // 選択範囲がある場合は、選択範囲を削除
                    if (hasSelection) {
                        const selection = this.getSelection();
                        if (selection) {
                            // 複数アイテムにまたがる選択範囲の場合
                            if (selectionSpansMultipleItems(selection)) {
                                this.deleteMultiItemSelection(selection);
                            } else {
                                // 単一アイテム内の選択範囲の場合
                                this.deleteSelection();
                            }
                        }
                    } else {
                        // 通常のDelete処理
                        this.deleteForward();
                    }
                    break;
                case "Enter":
                    // 選択範囲がある場合は、選択範囲を削除してから改行を挿入
                    if (hasSelection) {
                        const selection = this.getSelection();
                        if (selection) {
                            // 複数アイテムにまたがる選択範囲の場合
                            if (selectionSpansMultipleItems(selection)) {
                                this.deleteMultiItemSelection(selection);
                            } else {
                                // 単一アイテム内の選択範囲の場合
                                this.deleteSelection();
                            }
                        }
                    }
                    this.insertLineBreak();
                    break;
                case "Escape":
                    this.clearSelection();
                    break;
                default:
                    return false;
            }
        }

        // カーソル点滅を開始
        store.startCursorBlink();
        return true;
    }

    // 選択範囲を左に拡張
    extendSelectionLeft() {
        const target = this.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (existingSelection.isReversed) {
                // 逆方向の選択範囲の場合、開始位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを左に移動
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveLeft();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = true;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveLeft();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.itemId;
                    endOffset = this.offset;
                    isReversed = true;
                }
            } else {
                // 正方向の選択範囲の場合、終了位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを左に移動
                this.moveLeft();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = false;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    isReversed = true;
                    const temp = startItemId;
                    startItemId = endItemId;
                    endItemId = temp;

                    const tempOffset = startOffset;
                    startOffset = endOffset;
                    endOffset = tempOffset;
                }
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.itemId;
            startOffset = this.offset;

            // カーソルを左に移動
            this.moveLeft();

            endItemId = this.itemId;
            endOffset = this.offset;
            isReversed = true;
        }

        // 既存の同ユーザーの選択範囲をクリアしてから新しい範囲を設定
        store.clearSelectionForUser(this.userId);
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // グローバルテキストエリアの選択範囲を設定
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    // 選択範囲を右に拡張
    extendSelectionRight() {
        const target = this.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (!existingSelection.isReversed) {
                // 正方向の選択範囲の場合、終了位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを右に移動
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveRight();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = false;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveRight();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.itemId;
                    endOffset = this.offset;
                    isReversed = false;
                }
            } else {
                // 逆方向の選択範囲の場合、開始位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを右に移動
                this.moveRight();

                startItemId = this.itemId;
                startOffset = this.offset;
                isReversed = true;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    isReversed = false;
                    const temp = startItemId;
                    startItemId = endItemId;
                    endItemId = temp;

                    const tempOffset = startOffset;
                    startOffset = endOffset;
                    endOffset = tempOffset;
                }
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.itemId;
            startOffset = this.offset;

            // カーソルを右に移動
            this.moveRight();

            endItemId = this.itemId;
            endOffset = this.offset;
            isReversed = false;
        }

        // 既存の同ユーザーの選択範囲をクリアしてから新しい範囲を設定
        store.clearSelectionForUser(this.userId);
        // 選択範囲を設定
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // グローバルテキストエリアの選択範囲を設定
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    // 選択範囲を上に拡張
    extendSelectionUp(): void {
        const target = this.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (existingSelection.isReversed) {
                // 逆方向の選択範囲の場合、開始位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを上に移動
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveUp();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = true;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveUp();

                    startItemId = this.itemId;
                    startOffset = this.offset;
                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    isReversed = false;
                }
            } else {
                // 正方向の選択範囲の場合、終了位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを上に移動
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveUp();

                startItemId = this.itemId;
                startOffset = this.offset;
                isReversed = false;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveUp();

                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    startItemId = this.itemId;
                    startOffset = this.offset;
                    isReversed = true;
                }
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.itemId;
            startOffset = this.offset;

            // カーソルを上に移動
            this.moveUp();

            endItemId = this.itemId;
            endOffset = this.offset;
            isReversed = true;
        }

        // 既存の同ユーザーの選択範囲をクリアしてから新しい範囲を設定
        store.clearSelectionForUser(this.userId);
        // 選択範囲を設定
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // グローバルテキストエリアの選択範囲を設定
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    // 選択範囲を下に拡張
    extendSelectionDown() {
        const target = this.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`extendSelectionDown called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // 現在の選択範囲を取得
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (!existingSelection.isReversed) {
                // 正方向の選択範囲の場合、終了位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを下に移動
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveDown();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = false;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Extending forward selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveDown();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.itemId;
                    endOffset = this.offset;
                    isReversed = false;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `Selection disappeared, reversed: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                        );
                    }
                }
            } else {
                // 逆方向の選択範囲の場合、開始位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを下に移動
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveDown();

                startItemId = this.itemId;
                startOffset = this.offset;
                isReversed = true;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Extending reversed selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveDown();

                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    startItemId = this.itemId;
                    startOffset = this.offset;
                    isReversed = false;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `Selection disappeared, reversed: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                        );
                    }
                }
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.itemId;
            startOffset = this.offset;

            // 現在位置を保存
            const oldItemId = this.itemId;
            // const oldOffset = this.offset; // Not used

            // カーソルを下に移動
            this.moveDown();

            // 移動先が同じアイテム内の場合は、全テキストを選択
            if (this.itemId === oldItemId) {
                // const text = this.getTargetText(target); // Not used
                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = false;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `New selection within same item: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }
            } else {
                // 別のアイテムに移動した場合
                endItemId = this.itemId;
                endOffset = this.offset; // 次のアイテムの現在位置まで選択（以前は0固定だった）
                isReversed = false;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `New selection across items: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }
            }
        }

        // 選択範囲の方向を適切に設定（テスト用の強制設定を削除）
        // 開始と終了が同じアイテムの場合、オフセットで方向を決定
        if (startItemId === endItemId) {
            isReversed = startOffset > endOffset;
        } // 異なるアイテムの場合、DOM上の順序で方向を決定
        else {
            let isReversedCalculated = false;
            if (typeof document !== "undefined") {
                const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
                const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);
                const startIdx = allItemIds.indexOf(startItemId);
                const endIdx = allItemIds.indexOf(endItemId);

                // インデックスが見つからない場合はデフォルトで正方向
                if (startIdx !== -1 && endIdx !== -1) {
                    isReversed = startIdx > endIdx;
                    isReversedCalculated = true;
                }
            }

            if (!isReversedCalculated) {
                isReversed = false;
            }
        }

        // 既存の同ユーザーの選択範囲をクリアしてから新しい範囲を設定
        store.clearSelectionForUser(this.userId);
        const selectionId = store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection created with ID: ${selectionId}, isReversed=${isReversed}`);
            console.log(`Current selections:`, store.selections);
        }

        // グローバルテキストエリアの選択範囲を設定
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // 選択範囲が正しく作成されたことを確認するために、DOMに反映されるまで少し待つ
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

                // 選択範囲が表示されていない場合は、再度選択範囲を設定
                if (selectionElements.length === 0) {
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.userId,
                        isReversed,
                    });

                    // 選択範囲の表示を強制的に更新
                    store.forceUpdate();
                }
            }, 150); // タイムアウトを150msに増やして、DOMの更新を待つ時間を長くする
        }
    }

    // 選択範囲を行頭まで拡張
    extendSelectionToLineStart() {
        const target = this.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`extendSelectionToLineStart called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // 現在の選択範囲を取得
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const lineStartOffset = getLineStartOffset(text, currentLineIndex);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Current line index: ${currentLineIndex}, lineStartOffset: ${lineStartOffset}, text: "${text}"`,
            );
        }

        // 現在のカーソル位置が既に行頭にある場合は何もしない
        if (this.offset === lineStartOffset && !existingSelection) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Already at line start, no selection created`);
            }
            return;
        }

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (existingSelection.isReversed) {
                // 逆方向の選択範囲の場合、開始位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを行頭に移動
                endItemId = this.itemId;
                endOffset = lineStartOffset;
                isReversed = true;
            } else {
                // 正方向の選択範囲の場合、終了位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを行頭に移動
                startItemId = this.itemId;
                startOffset = lineStartOffset;
                isReversed = false;
            }
        } else {
            // 新規選択範囲の作成
            // 現在位置から行頭までを選択
            startItemId = this.itemId;
            endItemId = this.itemId;

            // 現在位置と行頭の位置関係に基づいて方向を決定
            if (this.offset > lineStartOffset) {
                // 通常の場合（カーソルが行の途中にある）
                startOffset = this.offset;
                endOffset = lineStartOffset;
                isReversed = true; // 行頭に向かって選択するので逆方向
            } else {
                // カーソルが行頭にある場合（通常はここに入らない）
                startOffset = lineStartOffset;
                endOffset = this.offset;
                isReversed = false;
            }
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Setting selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}, isReversed=${isReversed}`,
            );
        }

        // 既存の同ユーザーの選択範囲をクリアしてから新しい範囲を設定
        store.clearSelectionForUser(this.userId);
        // 選択範囲を設定
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // カーソル位置を行頭に移動
        this.offset = lineStartOffset;
        this.applyToStore();

        // グローバルテキストエリアの選択範囲を設定
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    // 選択範囲を行末まで拡張
    extendSelectionToLineEnd() {
        const target = this.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`extendSelectionToLineEnd called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // 現在の選択範囲を取得
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const lineEndOffset = getLineEndOffset(text, currentLineIndex);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Current line index: ${currentLineIndex}, lineEndOffset: ${lineEndOffset}, text: "${text}"`);
        }

        // 現在のカーソル位置が既に行末にある場合は何もしない
        if (this.offset === lineEndOffset && !existingSelection) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Already at line end, no selection created`);
            }
            return;
        }

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (!existingSelection.isReversed) {
                // 正方向の選択範囲の場合、終了位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを行末に移動
                endItemId = this.itemId;
                endOffset = lineEndOffset;
                isReversed = false;
            } else {
                // 逆方向の選択範囲の場合、開始位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを行末に移動
                startItemId = this.itemId;
                startOffset = lineEndOffset;
                isReversed = true;
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.itemId;
            startOffset = this.offset;

            // 行末までを選択
            endItemId = this.itemId;
            endOffset = lineEndOffset;
            isReversed = this.offset > lineEndOffset;
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Setting selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}, isReversed=${isReversed}`,
            );
        }

        // 既存の同ユーザーの選択範囲をクリアしてから新しい範囲を設定
        store.clearSelectionForUser(this.userId);
        // 選択範囲を設定
        const selectionId = store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection created with ID: ${selectionId}`);
            console.log(`Current selections:`, store.selections);
        }

        // カーソル位置を行末に移動
        this.offset = lineEndOffset;
        this.applyToStore();

        // グローバルテキストエリアの選択範囲を設定
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // 選択範囲が正しく作成されたことを確認するために、DOMに反映されるまで少し待つ
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

                // 選択範囲が表示されていない場合は、再度選択範囲を設定
                if (selectionElements.length === 0) {
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.userId,
                        isReversed,
                    });

                    // 選択範囲の表示を強制的に更新
                    store.forceUpdate();
                }
            }, 100); // タイムアウトを100msに増やして、DOMの更新を待つ時間を長くする

            // 追加の確認と更新
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (selectionElements.length === 0) {
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Selection still not visible after 100ms, forcing update again`);
                    }

                    // 選択範囲を再設定
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.userId,
                        isReversed,
                    });

                    // 強制的に更新
                    store.forceUpdate();
                }
            }, 200);
        }
    }

    /**
     * 選択範囲をクリアする
     */
    clearSelection() {
        // 選択範囲をクリア
        store.clearSelectionForUser(this.userId);
    }

    // --- Extended navigation commands ---

    // 単語単位で左へ移動
    moveWordLeft() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);

        // If text is empty, just return without changing anything
        if (text.length === 0) {
            return;
        }

        let pos = this.offset;
        if (pos > 0) {
            pos--;
            while (pos > 0 && /\s/.test(text[pos])) pos--;
            while (pos > 0 && !/\s/.test(text[pos - 1])) pos--;
        }
        this.offset = pos;
        this.applyToStore();
        store.startCursorBlink();
    }

    // 単語単位で右へ移動
    moveWordRight() {
        const target = this.findTarget();
        if (!target) return;

        // Check if text exists and is not null/undefined before using it
        const text = this.getTargetText(target);
        if (text.length === 0) {
            return;
        }
        let pos = this.offset;
        const len = text.length;
        if (pos < len) {
            // Skip any whitespace to the right
            while (pos < len && /\s/.test(text[pos])) pos++;

            // Skip the entire word to the right (non-whitespace characters)
            while (pos < len && !/\s/.test(text[pos])) pos++;
        }
        this.offset = pos;
        this.applyToStore();
        store.startCursorBlink();
    }

    // 対応する角括弧へジャンプ
    jumpToMatchingBracket() {
        const target = this.findTarget();
        if (!target) return;
        const text = this.getTargetText(target);
        const pos = this.offset;
        const before = text[pos - 1];
        const current = text[pos];

        if (current === "[") {
            const close = text.indexOf("]", pos + 1);
            if (close !== -1) {
                this.offset = close + 1;
            }
        } else if (before === "[") {
            const close = text.indexOf("]", pos);
            if (close !== -1) {
                this.offset = close + 1;
            }
        } else if (current === "]") {
            const open = text.lastIndexOf("[", pos - 1);
            if (open !== -1) {
                this.offset = open;
            }
        } else if (before === "]") {
            const open = text.lastIndexOf("[", pos - 2);
            if (open !== -1) {
                this.offset = open;
            }
        }

        this.applyToStore();
        store.startCursorBlink();
    }

    // ドキュメント先頭に移動
    moveToDocumentStart() {
        const root = generalStore.currentPage;
        if (!root) return;
        let item: Item = root;
        while (item.items && (item.items as Iterable<Item>)[Symbol.iterator]) {
            const iter = (item.items as Iterable<Item>)[Symbol.iterator]();
            const first = iter.next();
            if (first.done) break;
            item = first.value;
        }
        this.itemId = item.id;
        this.offset = 0;
        this.applyToStore();
        store.startCursorBlink();
    }

    // ドキュメント末尾に移動
    moveToDocumentEnd() {
        const root = generalStore.currentPage;
        if (!root) return;
        let item: Item = root;
        while (item.items && (item.items as Iterable<Item>)[Symbol.iterator]) {
            let last: Item | undefined;
            for (const child of item.items as Iterable<Item>) {
                last = child;
            }
            if (!last) break;
            item = last;
        }
        this.itemId = item.id;
        this.offset = (item.text || "").length;
        this.applyToStore();
        store.startCursorBlink();
    }

    // PageUp/PageDown 相当の移動（10行単位）
    pageUp() {
        for (let i = 0; i < 10; i++) this.moveUp();
    }

    pageDown() {
        for (let i = 0; i < 10; i++) this.moveDown();
    }

    // スクロール操作
    scrollUp() {
        if (typeof window !== "undefined") window.scrollBy(0, -100);
    }

    scrollDown() {
        if (typeof window !== "undefined") window.scrollBy(0, 100);
    }

    altPageUp() {
        if (typeof window !== "undefined") window.scrollBy(0, -window.innerHeight);
    }

    altPageDown() {
        if (typeof window !== "undefined") window.scrollBy(0, window.innerHeight);
    }

    // フォーマットメソッドは下部で定義されています

    /**
     * 現在のアイテムのテキストを全選択する
     */
    selectAll() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);

        // 選択範囲を設定
        store.setSelection({
            startItemId: this.itemId,
            startOffset: 0,
            endItemId: this.itemId,
            endOffset: text.length,
            userId: this.userId,
            isReversed: false,
        });

        // グローバルテキストエリアの選択範囲を設定
        this.updateGlobalTextareaSelection(this.itemId, 0, this.itemId, text.length);

        // カーソル位置を末尾に設定
        this.offset = text.length;
        this.applyToStore();

        // カーソル点滅を開始
        store.startCursorBlink();
    }

    // Shift+Alt+Right で選択範囲を拡張
    expandSelection() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);
        const selection = this.getSelection();

        const startOffset = selection ? Math.min(selection.startOffset, selection.endOffset) : this.offset;

        store.setSelection({
            startItemId: this.itemId,
            startOffset,
            endItemId: this.itemId,
            endOffset: text.length,
            userId: this.userId,
            isReversed: false,
        });

        this.updateGlobalTextareaSelection(this.itemId, startOffset, this.itemId, text.length);

        this.offset = text.length;
        this.applyToStore();
        store.startCursorBlink();
    }

    // Shift+Alt+Left で選択範囲を縮小
    shrinkSelection() {
        const selection = this.getSelection();
        if (!selection) return;

        const newOffset = Math.min(selection.startOffset, selection.endOffset);
        this.offset = newOffset;
        this.applyToStore();
        this.clearSelection();
        this.updateGlobalTextareaSelection(this.itemId, newOffset, this.itemId, newOffset);
        store.startCursorBlink();
    }

    // Ctrl+L で現在行を選択
    selectLine() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const startOffset = getLineStartOffset(text, currentLineIndex);
        const endOffset = getLineEndOffset(text, currentLineIndex);

        store.setSelection({
            startItemId: this.itemId,
            startOffset,
            endItemId: this.itemId,
            endOffset,
            userId: this.userId,
            isReversed: false,
        });

        this.updateGlobalTextareaSelection(this.itemId, startOffset, this.itemId, endOffset);

        this.offset = endOffset;
        this.applyToStore();
        store.startCursorBlink();
    }

    /**
     * 選択されたテキストをコピーする
     */
    copySelectedText() {
        this.editor.copySelectedText();
    }

    /**
     * 選択されたテキストをカットする
     */
    cutSelectedText() {
        this.editor.cutSelectedText();
    }

    /**
     * 複数アイテムにまたがる選択範囲を削除する
     */

    /**
     * 選択範囲を削除する
     */
    deleteSelection() {
        this.editor.deleteSelection();
    }

    /**
     * アイテム間を移動する
     * @param direction 移動方向
     */
    private navigateToItem(direction: "left" | "right" | "up" | "down") {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `navigateToItem called with direction=${direction}, itemId=${this.itemId}, offset=${this.offset}`,
            );
        }

        // 前後アイテムへの移動はストア更新のみ行い、イベント発行はコンポーネントで処理
        const oldItemId = this.itemId;
        let newItemId = this.itemId; // デフォルトは現在のアイテム
        let newOffset = this.offset; // デフォルトは現在のオフセット
        let itemChanged = false;

        // 現在のアイテムのテキストを取得
        const currentTarget = this.findTarget();
        const currentText = this.getTargetText(currentTarget);
        const currentColumn = getCurrentColumn(currentText, this.offset);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Current column: ${currentColumn}, current text: "${currentText}"`);
        }

        // アイテム間移動の処理
        if (direction === "left") {
            let prevItem = findPreviousItem(this.itemId);

            // DOM fallback: when tree lookup fails (e.g., first child under page title),
            // try to use the visual order to locate the previous item.
            if (!prevItem && typeof document !== "undefined") {
                const currentEl = document.querySelector(`[data-item-id="${this.itemId}"]`);
                if (currentEl) {
                    const allItems = Array.from(document.querySelectorAll("[data-item-id]"));
                    const currentIndex = allItems.indexOf(currentEl);
                    if (currentIndex > 0) {
                        // Walk backwards until we find a previous element that is not an ancestor
                        // of the current element. Moving to an ancestor would incorrectly jump
                        // to the parent item when the current item has no previous sibling.
                        let prevEl: HTMLElement | undefined;
                        for (let i = currentIndex - 1; i >= 0; i--) {
                            const candidate = allItems[i] as HTMLElement;
                            if (candidate.contains(currentEl)) {
                                continue;
                            }
                            prevEl = candidate;
                            break;
                        }
                        if (prevEl) {
                            const prevItemId = prevEl.getAttribute("data-item-id");
                            if (prevItemId && prevItemId !== this.itemId) {
                                prevItem = searchItem(generalStore.currentPage as any, prevItemId);
                                newItemId = prevItemId;
                                const treeTextLength = prevItem
                                    ? this.getTargetText(prevItem as any).length
                                    : undefined;
                                const domTextLength = prevEl.querySelector(".item-text")?.textContent?.length
                                    ?? prevEl.textContent?.length
                                    ?? 0;
                                newOffset = treeTextLength ?? domTextLength ?? 0;
                                itemChanged = true;
                            }
                        }
                    }
                }
            }

            if (prevItem && !itemChanged) {
                newItemId = prevItem.id;
                newOffset = prevItem.text?.length || 0;
                itemChanged = true;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moving left to previous item: id=${prevItem.id}, offset=${newOffset}`);
                }
            } else if (!itemChanged) {
                // 前のアイテムがない場合は、同じアイテムの先頭に移動
                const target = this.findTarget();
                if (target) {
                    newOffset = 0;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`No previous item, moving to start of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "right") {
            // Check if we're at the end of the current item
            const target = this.findTarget();
            const text = target ? this.getTargetText(target) : "";
            const atEndOfCurrentItem = this.offset >= text.length;

            let nextItem = findNextItem(this.itemId);

            // If findNextItem failed, try to find the next item via DOM traversal as a fallback
            if (!nextItem) {
                nextItem = this.findNextItemViaDOM(this.itemId);
            }

            // If we're at the end of the current item and still don't have a next item,
            // try additional DOM-based approaches with broader selectors
            if (atEndOfCurrentItem && !nextItem && typeof document !== "undefined") {
                // Try to get all potential item elements, with a broader selector
                const allItemElements = Array.from(
                    document.querySelectorAll(
                        ".outliner-item[data-item-id], [data-item-id].outliner-item, [data-item-id]",
                    ),
                ) as HTMLElement[];

                let currentIndex = -1;
                for (let i = 0; i < allItemElements.length; i++) {
                    if (allItemElements[i].getAttribute("data-item-id") === this.itemId) {
                        currentIndex = i;
                        break;
                    }
                }

                if (currentIndex !== -1 && currentIndex < allItemElements.length - 1) {
                    const nextItemElement = allItemElements[currentIndex + 1];
                    const nextItemId = nextItemElement.getAttribute("data-item-id");

                    if (nextItemId) {
                        // Try to find this item in the Yjs tree
                        const root = generalStore.currentPage as any;
                        if (root) {
                            nextItem = searchItem(root, nextItemId);
                        }
                    }
                }
            }

            if (nextItem) {
                newItemId = nextItem.id;
                newOffset = 0;
                itemChanged = true;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moving right to next item: id=${nextItem.id}, offset=${newOffset}`);
                }
            } else if (atEndOfCurrentItem && typeof document !== "undefined") {
                // DOM-based approach to find the next item by looking for visually adjacent elements
                try {
                    // Most direct approach: Find the element with the current item ID and get its next sibling
                    const currentItemElement = document.querySelector(`[data-item-id="${this.itemId}"]`);

                    if (currentItemElement) {
                        // First try to get the immediate next sibling
                        let nextItemElement: Element | null = currentItemElement.nextElementSibling;

                        // If no immediate sibling, traverse up and try again
                        let parentElement: Element | null = currentItemElement.parentElement;
                        while (!nextItemElement && parentElement) {
                            nextItemElement = parentElement.nextElementSibling;
                            if (!nextItemElement) {
                                parentElement = parentElement.parentElement;
                            }
                        }

                        // If still no next element found, use querySelector to get elements after current one
                        if (!nextItemElement) {
                            const allItems = Array.from(document.querySelectorAll("[data-item-id]"));
                            const currentIndex = allItems.indexOf(currentItemElement);
                            if (currentIndex !== -1 && currentIndex < allItems.length - 1) {
                                nextItemElement = allItems[currentIndex + 1];
                            }
                        }

                        // Try to get the ID from the found element
                        if (nextItemElement) {
                            let nextItemId = nextItemElement.getAttribute("data-item-id");

                            // If not found directly, try to find a child element that has the ID
                            if (!nextItemId) {
                                const childWithId = nextItemElement.querySelector("[data-item-id]");
                                if (childWithId) {
                                    nextItemId = childWithId.getAttribute("data-item-id");
                                }
                            }

                            if (nextItemId && nextItemId !== this.itemId) {
                                // Directly use the found next item ID
                                newItemId = nextItemId;
                                newOffset = 0; // Start at the beginning of the next item
                                itemChanged = true;

                                // デバッグ情報
                                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                    console.log(
                                        `Moving right to next item (DOM direct lookup): id=${nextItemId}, offset=${newOffset}`,
                                    );
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error in DOM-based next item lookup:", e);
                }

                // If still not found, try a different approach by using a depth-first traversal of the tree
                if (!itemChanged) {
                    const root = generalStore.currentPage as any;
                    if (root) {
                        const allItemIds = this.collectAllItemIds(root, []);
                        const currentIndex = allItemIds.indexOf(this.itemId);
                        if (currentIndex !== -1 && currentIndex < allItemIds.length - 1) {
                            const nextItemId = allItemIds[currentIndex + 1];
                            const nextItemFromTree = searchItem(root, nextItemId);
                            if (nextItemFromTree) {
                                newItemId = nextItemId;
                                newOffset = 0;
                                itemChanged = true;

                                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                    console.log(
                                        `Moving right to next item (tree fallback): id=${nextItemId}, offset=${newOffset}`,
                                    );
                                }
                            }
                        }
                    }
                }

                // FINAL ULTIMATE FALLBACK: If we still haven't found the next item,
                // let's try to get all items from the current page and find the next one in sequence
                if (!itemChanged) {
                    try {
                        const root = generalStore.currentPage as any;
                        if (root) {
                            // Try a depth-first search to collect all items in proper order
                            const allItemsList: string[] = this.collectAllItemIds(root, []);

                            // Find current index and get the next item
                            const currentIndex = allItemsList.indexOf(this.itemId);
                            if (currentIndex !== -1 && currentIndex < allItemsList.length - 1) {
                                const nextItemId = allItemsList[currentIndex + 1];
                                newItemId = nextItemId;
                                newOffset = 0;
                                itemChanged = true;

                                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                    console.log(
                                        `Moving right to next item (breadth-first fallback): id=${nextItemId}, offset=${newOffset}`,
                                    );
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error in ultimate fallback:", e);
                    }
                }

                // ABSOLUTE LAST RESORT: If itemChanged is still false after all attempts,
                // try to get all items from the DOM directly and move to the visually next one
                if (!itemChanged && typeof document !== "undefined") {
                    try {
                        // Get all elements with data-item-id attributes
                        const allElements = Array.from(document.querySelectorAll("[data-item-id]"));

                        // Find the current item's index
                        const currentElement = document.querySelector(`[data-item-id="${this.itemId}"]`);
                        if (currentElement) {
                            const currentIndex = allElements.indexOf(currentElement);
                            if (currentIndex !== -1 && currentIndex < allElements.length - 1) {
                                // Get the next element in the DOM
                                const nextElement = allElements[currentIndex + 1] as HTMLElement;
                                const nextItemId = nextElement.getAttribute("data-item-id");

                                if (nextItemId && nextItemId !== this.itemId) {
                                    newItemId = nextItemId;
                                    newOffset = 0;
                                    itemChanged = true;

                                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                        console.log(
                                            `Moving right to next item (last resort DOM): id=${nextItemId}, offset=${newOffset}`,
                                        );
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error in last resort DOM approach:", e);
                    }
                }

                // If itemChanged is still false after ALL attempts, we're at the end but couldn't find a next item
                // In this case, we should remain at the end of the current item, but still trigger the update
                if (!itemChanged) {
                    // Stay at the end of the current item but ensure we update the cursor state
                    // This case occurs when there is no next item available
                    newOffset = text.length;
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `No next item found after all attempts. Staying at end of current item: offset=${newOffset}`,
                        );
                    }
                }
            } else {
                // If we're not at the end of an item, just stay in the same item at end position
                const target = this.findTarget();
                if (target) {
                    newOffset = this.getTargetText(target).length;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "up") {
            let prevItem = findPreviousItem(this.itemId);
            // If no previous sibling, try to navigate to parent item for up direction
            // Note: item.parent returns Items (collection), not Item. We need to find the parent Item.
            if (!prevItem) {
                const currentTarget = this.findTarget();
                const parentCollection = currentTarget?.parent;
                // Get the parent Item by creating it from parentKey (skip "root" as it's the project level)
                if (parentCollection && parentCollection.parentKey && parentCollection.parentKey !== "root") {
                    prevItem = new (currentTarget!.constructor as any)(
                        currentTarget!.ydoc,
                        currentTarget!.tree,
                        parentCollection.parentKey,
                    );
                }
            }
            if (prevItem) {
                newItemId = prevItem.id;
                const prevText = this.getTargetText(prevItem as any);
                const visualLineInfo = getVisualLineInfo(prevItem.id, prevText.length > 0 ? prevText.length - 1 : 0);
                let lastLineIndex: number | undefined;
                let lastLineStart: number | undefined;
                let lastLineLength: number | undefined;
                let targetColumn: number | undefined;

                if (visualLineInfo && visualLineInfo.totalLines > 0) {
                    lastLineIndex = visualLineInfo.totalLines - 1;
                    const lastLineRange = getVisualLineOffsetRange(prevItem.id, lastLineIndex);
                    if (lastLineRange) {
                        lastLineStart = lastLineRange.startOffset;
                        lastLineLength = lastLineRange.endOffset - lastLineRange.startOffset;

                        let desiredColumn = this.initialColumn !== null ? this.initialColumn : currentColumn;
                        if (this.offset === 0) {
                            desiredColumn = 0;
                        }

                        targetColumn = Math.min(desiredColumn, lastLineLength);
                        newOffset = lastLineStart + targetColumn;
                    } else {
                        newOffset = prevText.length;
                    }
                } else {
                    newOffset = prevText.length;
                }

                itemChanged = true;

                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Moving up to previous item's last line: id=${prevItem.id}, lastLineIndex=${lastLineIndex}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
                    );
                }
            } else {
                // 前のアイテムがない場合は、同じアイテムの先頭に移動
                newOffset = 0;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`No previous item, moving to start of current item: offset=${newOffset}`);
                }
            }
        } else if (direction === "down") {
            let nextItem = findNextItem(this.itemId);

            // If findNextItem failed, try to find the next item via DOM traversal as a fallback
            if (!nextItem) {
                nextItem = this.findNextItemViaDOM(this.itemId);
            }

            if (nextItem) {
                newItemId = nextItem.id;
                const nextText = this.getTargetText(nextItem as any);
                // const nextLines = nextText.split("\n"); // Not used
                const firstLineIndex = 0;
                const firstLineStart = getLineStartOffset(nextText, firstLineIndex);
                const firstLineEnd = getLineEndOffset(nextText, firstLineIndex);
                const firstLineLength = firstLineEnd - firstLineStart;

                // x座標の変化が最も小さい位置を計算
                // 初期列位置または現在の列位置に最も近い位置を選択
                // 次のアイテムの最初の行の長さを超えないようにする
                const targetColumn = Math.min(
                    this.initialColumn !== null ? this.initialColumn : currentColumn,
                    firstLineLength,
                );
                newOffset = firstLineStart + targetColumn;

                // 特殊ケース: 現在のカーソルが行の末尾（オフセットがテキスト長）にある場合は、
                // 次のアイテムの最初の行の末尾に移動
                const currentTarget = this.findTarget();
                const currentText = this.getTargetText(currentTarget);
                if (this.offset === currentText.length) {
                    newOffset = firstLineEnd;
                }

                itemChanged = true;

                // デバッグ情報
                console.log(
                    `navigateToItem down - Moving to next item's first line: itemId=${nextItem.id}, offset=${newOffset}, targetColumn=${targetColumn}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}`,
                );
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Moving down to next item's first line: id=${nextItem.id}, firstLineIndex=${firstLineIndex}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}`,
                    );
                }
            } else {
                // 次のアイテムがない場合は、同じアイテムの末尾に移動
                const target = this.findTarget();
                if (target) {
                    newOffset = this.getTargetText(target).length;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        }

        // アイテムが変更された場合のみ処理を実行
        if (itemChanged) {
            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Item changed: oldItemId=${oldItemId}, newItemId=${newItemId}, newOffset=${newOffset}`);
            }

            // 移動前に古いアイテムのカーソルを確実に削除
            store.clearCursorForItem(oldItemId);

            // 同じユーザーの他のカーソルも削除（単一カーソルモードを維持）
            // 注意: 全てのカーソルをクリアするのではなく、同じユーザーのカーソルのみをクリア
            const cursorEntries = store.cursors ? Object.values(store.cursors) : [];
            const cursorsToRemove = cursorEntries
                .filter(c => c.userId === this.userId && c.cursorId !== this.cursorId)
                .map(c => c.cursorId);

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Removing cursors: ${cursorsToRemove.join(", ")}`);
            }

            // 選択範囲をクリア
            store.clearSelectionForUser(this.userId);

            // 移動先アイテムの既存のカーソルも削除（重複防止）
            // 注意: 同じユーザーのカーソルのみを削除
            const cursorsInTargetItem = cursorEntries
                .filter(c => c.itemId === newItemId && c.userId === this.userId)
                .map(c => c.cursorId);

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Removing cursors in target item: ${cursorsInTargetItem.join(", ")}`);
            }

            // 新しいアイテムとオフセットを設定
            this.itemId = newItemId;
            this.offset = newOffset;

            // アクティブアイテムを更新
            store.setActiveItem(this.itemId);

            // 新しいカーソルを作成
            const cursorId = store.setCursor({
                itemId: this.itemId,
                offset: this.offset,
                isActive: true,
                userId: this.userId,
            });

            // cursorIdを更新
            this.cursorId = cursorId;

            // カーソル点滅を開始
            store.startCursorBlink();

            // カスタムイベントを発行
            if (typeof document !== "undefined") {
                const event = new CustomEvent("navigate-to-item", {
                    bubbles: true,
                    detail: {
                        direction,
                        fromItemId: oldItemId,
                        toItemId: this.itemId,
                        cursorScreenX: 0, // カーソルのX座標（アイテム間移動時は0を指定）
                    },
                });
                document.dispatchEvent(event);
            }
        } else {
            // アイテムが変更されなかった場合でも、カーソルの状態を更新
            this.offset = newOffset;
            this.applyToStore();
            store.startCursorBlink();

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Item not changed, updated offset: ${newOffset}`);
            }
        }
    }

    /**
     * グローバルテキストエリアの選択範囲を設定する
     * @param startItemId 開始アイテムID
     * @param startOffset 開始オフセット
     * @param endItemId 終了アイテムID
     * @param endOffset 終了オフセット
     */
    updateGlobalTextareaSelection(startItemId: string, startOffset: number, endItemId: string, endOffset: number) {
        // グローバルテキストエリアを取得
        const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
        if (!textarea) return;

        // アイテムのテキストを取得
        const startItemEl = document.querySelector(`[data-item-id="${startItemId}"] .item-text`) as HTMLElement;
        const endItemEl = document.querySelector(`[data-item-id="${endItemId}"] .item-text`) as HTMLElement;

        if (!startItemEl || !endItemEl) return;

        const startItemText = startItemEl.textContent || "";
        // const endItemText = endItemEl.textContent || ""; // Not used

        // 単一アイテム内の選択範囲の場合
        if (startItemId === endItemId) {
            // テキストエリアの内容を更新
            textarea.value = startItemText;

            // 選択範囲を設定
            textarea.setSelectionRange(startOffset, endOffset);
        } else {
            // 複数アイテムにまたがる選択範囲の場合
            // 全てのアイテムを取得
            const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
            const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);

            // 開始アイテムと終了アイテムのインデックスを取得
            const startIdx = allItemIds.indexOf(startItemId);
            const endIdx = allItemIds.indexOf(endItemId);

            if (startIdx === -1 || endIdx === -1) return;

            // 開始インデックスと終了インデックスを正規化
            const firstIdx = Math.min(startIdx, endIdx);
            const lastIdx = Math.max(startIdx, endIdx);

            // 選択範囲内のアイテムのテキストを連結
            let combinedText = "";
            for (let i = firstIdx; i <= lastIdx; i++) {
                const itemId = allItemIds[i];
                const itemEl = document.querySelector(`[data-item-id="${itemId}"] .item-text`) as HTMLElement;
                if (itemEl) {
                    combinedText += itemEl.textContent || "";
                    if (i < lastIdx) combinedText += "\n";
                }
            }

            // テキストエリアの内容を更新
            textarea.value = combinedText;

            // 選択範囲の開始位置と終了位置を計算
            let selectionStart = 0;
            let selectionEnd = 0;

            // 開始アイテムから開始位置までのテキスト長を計算
            if (startIdx === firstIdx) {
                selectionStart = startOffset;
            } else {
                // 開始アイテムが終了アイテムより後にある場合（逆方向選択）
                let textBeforeStart = 0;
                for (let i = firstIdx; i < startIdx; i++) {
                    const itemId = allItemIds[i];
                    const itemEl = document.querySelector(`[data-item-id="${itemId}"] .item-text`) as HTMLElement;
                    if (itemEl) {
                        textBeforeStart += (itemEl.textContent || "").length + 1; // +1 for newline
                    }
                }
                selectionStart = textBeforeStart + startOffset;
            }

            // 終了アイテムから終了位置までのテキスト長を計算
            if (endIdx === lastIdx) {
                let textBeforeEnd = 0;
                for (let i = firstIdx; i < endIdx; i++) {
                    const itemId = allItemIds[i];
                    const itemEl = document.querySelector(`[data-item-id="${itemId}"] .item-text`) as HTMLElement;
                    if (itemEl) {
                        textBeforeEnd += (itemEl.textContent || "").length + 1; // +1 for newline
                    }
                }
                selectionEnd = textBeforeEnd + endOffset;
            } else {
                // 終了アイテムが開始アイテムより前にある場合（逆方向選択）
                selectionEnd = endOffset;
            }

            // 選択範囲を設定
            textarea.setSelectionRange(selectionStart, selectionEnd);
        }
    }

    /**
     * 選択範囲のテキストを太字に変更する（Scrapbox構文: [[text]]）
     */
    formatBold() {
        this.editor.formatBold();
    }

    /**
     * 選択範囲のテキストを斜体に変更する（Scrapbox構文: [/ text]）
     */
    formatItalic() {
        this.editor.formatItalic();
    }

    /**
     * 選択範囲のテキストに下線を追加する（HTML タグを使用）
     */
    formatUnderline() {
        this.editor.formatUnderline();
    }

    /**
     * 選択範囲のテキストに取り消し線を追加する（Scrapbox構文: [- text]）
     */
    formatStrikethrough() {
        this.editor.formatStrikethrough();
    }

    /**
     * 選択範囲のテキストをコードに変更する（Scrapbox構文: `text`）
     */
    formatCode() {
        this.editor.formatCode();
    }

    /**
     * 選択範囲にフォーマットを適用する共通メソッド
     * @param markdownPrefix Markdown形式のプレフィックス
     * @param markdownSuffix Markdown形式のサフィックス
     * @param scrapboxPrefix Scrapbox形式のプレフィックス
     * @param scrapboxSuffix Scrapbox形式のサフィックス
     */

    /**
     * 選択範囲にScrapbox構文のフォーマットを適用する
     * @param formatType フォーマットの種類（'bold', 'italic', 'strikethrough', 'underline', 'code'）
     */

    /**
     * 複数アイテムにまたがる選択範囲にフォーマットを適用する
     */

    /**
     * 複数アイテムにまたがる選択範囲にScrapbox構文のフォーマットを適用する
     */

    /**
     * Find the next item using DOM traversal as a fallback mechanism
     * @param currentItemId The ID of the current item
     * @returns The next item if found, otherwise undefined
     */
    private findNextItemViaDOM(currentItemId: string): any | undefined {
        if (typeof document === "undefined") return undefined;

        // Find the current element in the DOM
        const currentEl = document.querySelector(`[data-item-id="${currentItemId}"]`) as HTMLElement;
        if (!currentEl) return undefined;

        // Try to find the next element with data-item-id attribute
        // Look for the next sibling first
        let nextEl: HTMLElement | null = currentEl.nextElementSibling as HTMLElement;

        // If no direct sibling, try to find next item in the DOM tree
        let searchEl = currentEl;
        while (!nextEl && searchEl.parentElement) {
            nextEl = searchEl.parentElement.nextElementSibling as HTMLElement;
            if (!nextEl) {
                searchEl = searchEl.parentElement;
            }
        }

        // If no sibling at current level, try to find next item among descendants
        if (!nextEl) {
            // Look for next item in the subtree
            const allItems = document.querySelectorAll("[data-item-id]") as NodeListOf<HTMLElement>;
            let foundCurrent = false;

            for (let i = 0; i < allItems.length; i++) {
                if (foundCurrent) {
                    nextEl = allItems[i];
                    break;
                }
                if (allItems[i].getAttribute("data-item-id") === currentItemId) {
                    foundCurrent = true;
                }
            }
        }

        if (nextEl) {
            const nextItemId = nextEl.getAttribute("data-item-id");

            // Since we can't directly access the Item objects from the DOM,
            // we need to find it in the Yjs tree
            if (nextItemId) {
                const root = generalStore.currentPage as any;
                if (root) {
                    const found = searchItem(root, nextItemId);
                    if (found) return found;
                }
            }
        }

        return undefined;
    }

    /**
     * Collect all item IDs from the tree in traversal order
     * @param node The starting node to collect from
     * @param ids Array to collect IDs into
     * @returns Array of item IDs in tree traversal order
     */
    private collectAllItemIds(node: any, ids: string[]): string[] {
        if (node.id) {
            ids.push(node.id);
        }

        // Check if node has items that are iterable
        if (node.items && typeof (node.items as any)[Symbol.iterator] === "function") {
            for (const child of node.items as Iterable<any>) {
                this.collectAllItemIds(child, ids);
            }
        }

        return ids;
    }
}
// test 1760075045
