import type { Item } from "../../schema/app-schema";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
// import { store as generalStore } from "../../stores/store.svelte"; // Not used
// Define a generic cursor interface that we expect
interface Cursor {
    itemId: string;
    offset: number;
    userId: string;
    resetInitialColumn(): void;
    findTarget(): Item | null;
    findPreviousItem(): Item | null;
    findNextItem(): Item | null;
    clearSelection(): void;
    deleteMultiItemSelection(selection: any): void; // This will need to be properly typed too
    applyToStore(): void;
    // Add other required methods as needed
}

export class CursorTextOperations {
    private cursor: Cursor; // Cursorクラスのインスタンスを保持

    constructor(cursor: Cursor) {
        this.cursor = cursor;
    }

    /**
     * テキストを挿入する
     * @param ch 挿入するテキスト
     */
    insertText(ch: string) {
        // 上下キー以外の操作なので初期列位置をリセット
        this.cursor.resetInitialColumn();

        const node = this.cursor.findTarget();
        if (!node) {
            console.error(`insertText: Target item not found for itemId: ${this.cursor.itemId}`);
            return;
        }

        const currentText = node.text?.toString?.() ?? "";
        console.log(`insertText: Inserting "${ch}" at offset ${this.cursor.offset} in item ${this.cursor.itemId}`);
        console.log(`insertText: Current text: "${currentText}"`);

        // 選択範囲がある場合は、選択範囲を削除してからテキストを挿入
        const selection = Object.values(store.selections).find(s =>
            s.userId === this.cursor.userId
            && s.startItemId === this.cursor.itemId
            && s.endItemId === this.cursor.itemId
        );

        if (selection && selection.startOffset !== selection.endOffset) {
            // 選択範囲のテキストを削除
            const startOffset = Math.min(selection.startOffset, selection.endOffset);
            const endOffset = Math.max(selection.startOffset, selection.endOffset);
            const txt = currentText.slice(0, startOffset) + ch + currentText.slice(endOffset);
            node.updateText(txt);

            // カーソル位置を更新
            this.cursor.offset = startOffset + ch.length;

            // 選択範囲をクリア
            this.cursor.clearSelection();

            console.log(`insertText: Updated text with selection: "${node.text?.toString?.() ?? ""}"`);
        } else {
            // 通常の挿入
            const txt = currentText.slice(0, this.cursor.offset) + ch + currentText.slice(this.cursor.offset);
            node.updateText(txt);
            this.cursor.offset += ch.length;

            console.log(`insertText: Updated text: "${node.text?.toString?.() ?? ""}"`);
        }

        this.cursor.applyToStore();

        // onEdit コールバックを呼び出す
        store.triggerOnEdit();

        // 注意: グローバルテキストエリアの値を同期してはいけない
        // マルチカーソル環境では、複数のアイテムが同時に編集される可能性があり、
        // 単一のテキストエリアに特定のアイテムの値を設定することは適切ではない
    }

    /**
     * カーソル位置の前の文字を削除する
     */
    deleteBackward() {
        // 上下キー以外の操作なので初期列位置をリセット
        this.cursor.resetInitialColumn();

        const node = this.cursor.findTarget();
        if (!node) return;

        // 選択範囲がある場合は、選択範囲を削除
        const selection = Object.values(store.selections).find(s => s.userId === this.cursor.userId);

        if (selection && selection.startOffset !== selection.endOffset) {
            // 複数アイテムにまたがる選択範囲の場合
            if (selection.startItemId !== selection.endItemId) {
                this.cursor.deleteMultiItemSelection(selection);
                return;
            }

            // 単一アイテム内の選択範囲の場合
            if (selection.startItemId === this.cursor.itemId && selection.endItemId === this.cursor.itemId) {
                // 選択範囲のテキストを削除
                const startOffset = Math.min(selection.startOffset, selection.endOffset);
                const endOffset = Math.max(selection.startOffset, selection.endOffset);
                let txt = node.text;
                txt = txt.slice(0, startOffset) + txt.slice(endOffset);
                node.updateText(txt);

                // カーソル位置を更新
                this.cursor.offset = startOffset;

                // 選択範囲をクリア
                this.cursor.clearSelection();
            }
        } else {
            // 通常の削除
            if (this.cursor.offset > 0) {
                let txt = node.text?.toString?.() ?? "";
                const pos = this.cursor.offset - 1;
                txt = txt.slice(0, pos) + txt.slice(pos + 1);
                node.updateText(txt);
                this.cursor.offset = Math.max(0, this.cursor.offset - 1);
            } else {
                // 行頭で前アイテムとの結合
                this.mergeWithPreviousItem();
            }
        }

        this.cursor.applyToStore();

        // onEdit コールバックを呼び出す
        store.triggerOnEdit();

        // 注意: グローバルテキストエリアの値を同期してはいけない
        // マルチカーソル環境では、複数のアイテムが同時に編集される可能性があり、
        // 単一のテキストエリアに特定のアイテムの値を設定することは適切ではない
    }

    /**
     * カーソル位置の後の文字を削除する
     */
    deleteForward() {
        // 上下キー以外の操作なので初期列位置をリセット
        this.cursor.resetInitialColumn();

        const node = this.cursor.findTarget();
        if (!node) return;

        // 選択範囲がある場合は、選択範囲を削除
        const selection = Object.values(store.selections).find(s => s.userId === this.cursor.userId);

        if (selection && selection.startOffset !== selection.endOffset) {
            // 複数アイテムにまたがる選択範囲の場合
            if (selection.startItemId !== selection.endItemId) {
                this.cursor.deleteMultiItemSelection(selection);
                return;
            }

            // 単一アイテム内の選択範囲の場合
            if (selection.startItemId === this.cursor.itemId && selection.endItemId === this.cursor.itemId) {
                // 選択範囲のテキストを削除
                const startOffset = Math.min(selection.startOffset, selection.endOffset);
                const endOffset = Math.max(selection.startOffset, selection.endOffset);
                let txt = node.text;
                txt = txt.slice(0, startOffset) + txt.slice(endOffset);
                node.updateText(txt);

                // カーソル位置を更新
                this.cursor.offset = startOffset;

                // 選択範囲をクリア
                this.cursor.clearSelection();
            }
        } else {
            // 通常の削除
            let txt = node.text?.toString?.() ?? "";
            if (this.cursor.offset < txt.length) {
                txt = txt.slice(0, this.cursor.offset) + txt.slice(this.cursor.offset + 1);
                node.updateText(txt);
            } else {
                // 行末の場合
                // アイテムが空の場合はアイテム自体を削除
                if (txt.length === 0) {
                    this.deleteEmptyItem();
                    return;
                }
                // 空でない場合は次アイテムとの結合
                this.mergeWithNextItem();
            }
        }

        this.cursor.applyToStore();

        // onEdit コールバックを呼び出す
        store.triggerOnEdit();

        // グローバルテキストエリアの値も同期
        const textarea = store.getTextareaRef();
        if (textarea) {
            textarea.value = node.text;
            textarea.setSelectionRange(this.cursor.offset, this.cursor.offset);
            console.log(`deleteForward: Synced textarea value: "${textarea.value}"`);
        }
    }

    /**
     * 前のアイテムと結合する
     */
    mergeWithPreviousItem() {
        const currentItem = this.cursor.findTarget();
        if (!currentItem) return;

        const prevItem = this.cursor.findPreviousItem();
        if (!prevItem) return;

        // 前のアイテムのテキストを取得
        const prevText = prevItem.text || "";
        const currentText = currentItem.text || "";

        // 前のアイテムのテキストを更新
        prevItem.updateText(prevText + currentText);

        // 現在のアイテムを削除
        currentItem.delete();

        // カーソル位置を更新
        const oldItemId = this.cursor.itemId;
        this.cursor.itemId = prevItem.id;
        this.cursor.offset = prevText.length;

        // 古いアイテムのカーソルをクリア（アイテム削除後）
        store.clearCursorForItem(oldItemId);

        // アクティブアイテムを設定
        store.setActiveItem(this.cursor.itemId);

        // カーソルの点滅を開始
        store.startCursorBlink();
    }

    /**
     * 次のアイテムと結合する
     */
    mergeWithNextItem() {
        const currentItem = this.cursor.findTarget();
        if (!currentItem) return;

        const nextItem = this.cursor.findNextItem();
        if (!nextItem) return;

        // 現在のアイテムと次のアイテムのテキストを取得
        const currentText = currentItem.text || "";
        const nextText = nextItem.text || "";

        // 現在のアイテムのテキストを更新
        currentItem.updateText(currentText + nextText);

        // 次のアイテムを削除
        nextItem.delete();

        // カーソル位置はそのまま（現在のアイテムの末尾）
    }

    /**
     * 空のアイテムを削除する
     */
    deleteEmptyItem() {
        const currentItem = this.cursor.findTarget();
        if (!currentItem) return;

        // アイテムが空でない場合は何もしない
        if (currentItem.text && currentItem.text.length > 0) return;

        // 次のアイテムを探す
        const nextItem = this.cursor.findNextItem();

        // カーソルを移動する先を決定
        let targetItemId: string;
        let targetOffset: number;

        if (nextItem) {
            // 次のアイテムがある場合は次のアイテムの先頭に移動
            targetItemId = nextItem.id;
            targetOffset = 0;
        } else {
            // 次のアイテムがない場合は前のアイテムの末尾に移動
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                targetItemId = prevItem.id;
                targetOffset = prevItem.text ? prevItem.text.length : 0;
            } else {
                // 前のアイテムもない場合（最後の1つのアイテム）は削除しない
                return;
            }
        }

        // 現在のアイテムのカーソルをクリア
        store.clearCursorForItem(this.cursor.itemId);

        // アイテムを削除
        currentItem.delete();

        // 新しい位置にカーソルを設定
        this.cursor.itemId = targetItemId;
        this.cursor.offset = targetOffset;

        // ストアを更新
        store.setActiveItem(this.cursor.itemId);
        store.setCursor({
            itemId: this.cursor.itemId,
            offset: this.cursor.offset,
            isActive: true,
            userId: this.cursor.userId,
        });

        // カーソル点滅を開始
        store.startCursorBlink();
    }
}

// Standalone utility exports used by CursorBase
export function deleteEmptyItem(current?: Item) {
    try {
        if (!current) return;
        const text = current.text ?? "";
        if (text.length > 0) return;
        const parent = current.parent;
        const idx = parent ? parent.indexOf(current) : -1;
        const next = parent && idx >= 0 ? parent.at(idx + 1) : undefined;
        const prev = parent && idx > 0 ? parent.at(idx - 1) : undefined;

        // Clear cursor for the current item and delete it
        store.clearCursorForItem(current.id);
        current.delete();

        // Move active item focus
        const target = next ?? prev ?? undefined;
        if (target) {
            store.setActiveItem(target.id);
            store.startCursorBlink();
        } else {
            store.setActiveItem(null);
        }
    } catch (e) {
        console.warn("deleteEmptyItem fallback failed:", e);
    }
}

export function mergeWithNextItem(current?: Item) {
    try {
        if (!current) return;
        const parent = current.parent;
        if (!parent) return;
        const idx = parent.indexOf(current);
        const next = parent.at(idx + 1);
        if (!next) return;

        const a = current.text ?? "";
        const b = next.text ?? "";
        current.updateText(String(a) + String(b));
        next.delete();

        store.setActiveItem(current.id);
        store.startCursorBlink();
    } catch (e) {
        console.warn("mergeWithNextItem fallback failed:", e);
    }
}

export function mergeWithPreviousItem(current?: Item) {
    try {
        if (!current) return;
        const parent = current.parent;
        if (!parent) return;
        const idx = parent.indexOf(current);
        const prev = idx > 0 ? parent.at(idx - 1) : undefined;
        if (!prev) return;

        const a = prev.text ?? "";
        const b = current.text ?? "";
        prev.updateText(String(a) + String(b));
        const prevId = prev.id;
        current.delete();

        store.setActiveItem(prevId);
        store.startCursorBlink();
    } catch (e) {
        console.warn("mergeWithPreviousItem fallback failed:", e);
    }
}
