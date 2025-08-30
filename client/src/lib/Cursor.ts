// @ts-nocheck
import { Tree } from "fluid-framework";
import * as Y from "yjs";
import { TreeViewManager } from "../fluid/TreeViewManager";
import type { Item } from "../schema/app-schema";
import { Items } from "../schema/app-schema";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";
import { ScrapboxFormatter } from "../utils/ScrapboxFormatter";

interface CursorOptions {
    itemId: string;
    offset: number;
    isActive: boolean;
    userId: string;
}

export class Cursor {
    cursorId: string;
    itemId: string;
    offset: number;
    isActive: boolean;
    userId: string;
    // 上下キー操作時に使用する初期列位置
    private initialColumn: number | null = null;

    constructor(cursorId: string, opts: CursorOptions) {
        this.cursorId = cursorId;
        this.itemId = opts.itemId;
        this.offset = opts.offset;
        this.isActive = opts.isActive;
        this.userId = opts.userId;
    }

    // SharedTree 上の Item を再帰検索
    findTarget(): Item | undefined {
        const root = generalStore.currentPage;
        if (!root) return undefined;
        return this.searchItem(root, this.itemId);
    }

    // 前のアイテムを探す
    private findPreviousItem(): Item | undefined {
        const root = generalStore.currentPage;
        if (!root) return undefined;
        return this.findPreviousItemRecursive(root, this.itemId);
    }

    private findPreviousItemRecursive(node: Item, targetId: string, prevItem?: Item): Item | undefined {
        if (node.id === targetId) {
            return prevItem;
        }

        // 子アイテムを配列として取得
        const children: Item[] = [];
        if (node.items && (node.items as Iterable<Item>)[Symbol.iterator]) {
            for (const child of node.items as Iterable<Item>) {
                children.push(child);
            }
        }

        // 子アイテムを順番に処理
        for (let i = 0; i < children.length; i++) {
            const child = children[i];

            // 現在の子がターゲットの場合、前の兄弟または親を返す
            if (child.id === targetId) {
                return i > 0 ? children[i - 1] : node;
            }

            // 子の子孫を再帰的に検索
            const found = this.findPreviousItemRecursive(child, targetId, i > 0 ? children[i - 1] : node);
            if (found) return found;
        }

        return undefined;
    }

    // 次のアイテムを探す
    private findNextItem(): Item | undefined {
        const root = generalStore.currentPage;
        if (!root) return undefined;
        return this.findNextItemRecursive(root, this.itemId);
    }

    private findNextItemRecursive(node: Item, targetId: string): Item | undefined {
        if (node.id === targetId) {
            // 子アイテムがあれば最初の子を返す
            if (node.items && (node.items as Iterable<Item>)[Symbol.iterator]) {
                const iterator = (node.items as Iterable<Item>)[Symbol.iterator]();
                const first = iterator.next();
                if (!first.done) return first.value;
            }
            return undefined; // 子がなければ兄弟を探す（呼び出し元で処理）
        }

        // 子アイテムを配列として取得
        const children: Item[] = [];
        if (node.items && (node.items as Iterable<Item>)[Symbol.iterator]) {
            for (const child of node.items as Iterable<Item>) {
                children.push(child);
            }
        }

        // 子アイテムを順番に処理
        for (let i = 0; i < children.length; i++) {
            const child = children[i];

            if (child.id === targetId) {
                // ターゲットの次の兄弟があれば返す
                if (i < children.length - 1) {
                    return children[i + 1];
                }
                // 次の兄弟がなければ親の次の兄弟を探す（呼び出し元で処理）
                return undefined;
            }

            const found = this.findNextItemRecursive(child, targetId);
            if (found) return found;
        }

        return undefined;
    }

    private searchItem(node: Item, id: string): Item | undefined {
        if (node.id === id) return node;
        for (const child of node.items as Iterable<Item>) {
            const found = this.searchItem(child, id);
            if (found) return found;
        }
        return undefined;
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

    // テキスト内の行数を計算
    private countLines(text: string): number {
        return text.split("\n").length;
    }

    // 指定した行の開始オフセットを取得
    private getLineStartOffset(text: string, lineIndex: number): number {
        const lines = text.split("\n");
        let offset = 0;
        for (let i = 0; i < lineIndex; i++) {
            if (i < lines.length) {
                offset += lines[i].length + 1; // +1 は改行文字分
            }
        }
        return offset;
    }

    // 指定した行の終了オフセットを取得
    private getLineEndOffset(text: string, lineIndex: number): number {
        const lines = text.split("\n");
        if (lineIndex >= lines.length) {
            return text.length;
        }

        let offset = 0;
        for (let i = 0; i < lineIndex; i++) {
            offset += lines[i].length + 1; // +1 は改行文字分
        }
        // 対象行の長さを加算（改行文字は含めない）
        offset += lines[lineIndex].length;
        return offset;
    }

    // 現在のオフセットが何行目かを取得
    private getCurrentLineIndex(text: string, offset: number): number {
        // テキストが空の場合は0を返す
        if (!text) return 0;

        const lines = text.split("\n");

        // オフセットがテキスト長を超える場合は最後の行を返す
        if (offset >= text.length) {
            return lines.length - 1;
        }

        let currentOffset = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineLength = lines[i].length;

            // 現在の行内にオフセットがある場合
            if (offset < currentOffset + lineLength) {
                return i;
            }

            // 次の行に進む（改行文字を含む）
            currentOffset += lineLength;
            if (i < lines.length - 1) {
                currentOffset += 1; // 改行文字分
            }

            // 改行文字の位置にオフセットがある場合は次の行
            if (offset === currentOffset && i < lines.length - 1) {
                return i + 1;
            }
        }

        // デフォルトは最後の行
        return lines.length - 1;
    }

    // 現在の行内での列位置を取得
    private getCurrentColumn(text: string, offset: number): number {
        const lineIndex = this.getCurrentLineIndex(text, offset);
        const lineStartOffset = this.getLineStartOffset(text, lineIndex);
        return offset - lineStartOffset;
    }

    // 視覚的な行の情報を取得する
    private getVisualLineInfo(
        itemId: string,
        offset: number,
    ): {
        lineIndex: number;
        lineStartOffset: number;
        lineEndOffset: number;
        totalLines: number;
        lines: Array<{ startOffset: number; endOffset: number; y: number; }>;
    } | null {
        if (typeof window === "undefined") return null;

        const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);
        if (!itemElement) return null;

        const textElement = itemElement.querySelector(".item-text") as HTMLElement;
        if (!textElement) return null;

        const text = textElement.textContent || "";
        if (text.length === 0) {
            return {
                lineIndex: 0,
                lineStartOffset: 0,
                lineEndOffset: 0,
                totalLines: 1,
                lines: [{ startOffset: 0, endOffset: 0, y: 0 }],
            };
        }

        // Range API を使用して視覚的な行を判定
        const textNode = Array.from(textElement.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text;
        if (!textNode) return null;

        try {
            // 各文字位置での Y 座標を取得して行を判定
            const lines: { startOffset: number; endOffset: number; y: number; }[] = [];
            let currentLineY: number | null = null;
            let currentLineStart = 0;

            // 1文字単位でサンプリングして正確な行境界を検出
            const step = 1;

            for (let i = 0; i <= text.length; i += step) {
                const actualOffset = Math.min(i, text.length);
                const range = document.createRange();
                const safeOffset = Math.min(actualOffset, textNode.textContent?.length || 0);
                range.setStart(textNode, safeOffset);
                range.setEnd(textNode, safeOffset);

                const rect = range.getBoundingClientRect();
                const y = Math.round(rect.top);

                if (currentLineY === null) {
                    currentLineY = y;
                } else if (Math.abs(y - currentLineY) > 2) { // 2px以上の差があれば新しい行（より精密に検出）
                    // 新しい行が始まった
                    lines.push({
                        startOffset: currentLineStart,
                        endOffset: Math.max(currentLineStart, actualOffset - 1), // 最低でも開始位置は含める
                        y: currentLineY,
                    });
                    currentLineStart = actualOffset;
                    currentLineY = y;
                }
            }

            // 最後の行を追加
            if (currentLineY !== null) {
                lines.push({
                    startOffset: currentLineStart,
                    endOffset: text.length,
                    y: currentLineY,
                });
            }

            // 行が検出されなかった場合は単一行として扱う
            if (lines.length === 0) {
                lines.push({
                    startOffset: 0,
                    endOffset: text.length,
                    y: textElement.getBoundingClientRect().top,
                });
            }

            // 現在のオフセットがどの行にあるかを判定
            let currentLineIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                if (offset >= lines[i].startOffset && offset <= lines[i].endOffset) {
                    currentLineIndex = i;
                    break;
                }
            }

            // 範囲外の場合は最後の行に設定
            if (currentLineIndex >= lines.length) {
                currentLineIndex = lines.length - 1;
            }

            const currentLine = lines[currentLineIndex];
            return {
                lineIndex: currentLineIndex,
                lineStartOffset: currentLine.startOffset,
                lineEndOffset: currentLine.endOffset,
                totalLines: lines.length,
                lines: lines,
            };
        } catch (error) {
            console.error("Error getting visual line info:", error);
            return null;
        }
    }

    // 指定した視覚的な行のオフセット範囲を取得する
    private getVisualLineOffsetRange(
        itemId: string,
        lineIndex: number,
    ): { startOffset: number; endOffset: number; } | null {
        const visualInfo = this.getVisualLineInfo(itemId, 0); // 任意のオフセットで行情報を取得
        if (!visualInfo || lineIndex < 0 || lineIndex >= visualInfo.totalLines) {
            return null;
        }

        const targetLine = visualInfo.lines[lineIndex];
        return {
            startOffset: targetLine.startOffset,
            endOffset: targetLine.endOffset,
        };
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
        const text = target?.text ?? "";

        // テキストが空でない場合のみオフセットを増加
        if (text.length > 0 && this.offset < text.length) {
            this.offset = this.offset + 1;
            this.applyToStore();

            // カーソルが正しく更新されたことを確認
            store.startCursorBlink();
        } else {
            // 行末または空のテキストの場合は次アイテムへ移動
            this.navigateToItem("right");
        }
    }

    moveUp() {
        const target = this.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`moveUp called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // 視覚的な行の情報を取得
        const visualLineInfo = this.getVisualLineInfo(this.itemId, this.offset);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // フォールバック: 論理的な行での処理（改行文字ベース）
            const text = target.text || "";
            const currentLineIndex = this.getCurrentLineIndex(text, this.offset);
            if (currentLineIndex > 0) {
                const prevLineStart = this.getLineStartOffset(text, currentLineIndex - 1);
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
            const prevLineRange = this.getVisualLineOffsetRange(this.itemId, lineIndex - 1);
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
            const prevItem = this.findPreviousItem();
            if (prevItem) {
                // 前のアイテムの最後の視覚的な行に移動
                this.navigateToItem("up");

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moved to previous item: itemId=${this.itemId}, offset=${this.offset}`);
                }
            } else {
                // 前のアイテムがない場合は、同じアイテムの先頭に移動
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
        const visualLineInfo = this.getVisualLineInfo(this.itemId, this.offset);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // フォールバック: 論理的な行での処理（改行文字ベース）
            const text = target.text || "";
            const lines = text.split("\n");
            const currentLineIndex = this.getCurrentLineIndex(text, this.offset);
            if (currentLineIndex < lines.length - 1) {
                const nextLineStart = this.getLineStartOffset(text, currentLineIndex + 1);
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
            const nextLineRange = this.getVisualLineOffsetRange(this.itemId, lineIndex + 1);
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
            const nextItem = this.findNextItem();
            if (nextItem) {
                // 次のアイテムの最初の視覚的な行に移動
                this.navigateToItem("down");

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moved to next item: itemId=${this.itemId}, offset=${this.offset}`);
                }
            } else {
                // 次のアイテムがない場合は、同じアイテムの末尾に移動
                const text = target.text || "";
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
        // 上下キー以外の操作なので初期列位置をリセット
        this.resetInitialColumn();

        const node = this.findTarget();
        if (!node) {
            console.error(`insertText: Target item not found for itemId: ${this.itemId}`);
            return;
        }

        const ytext = (node as Item).text as Y.Text;
        console.log(`insertText: Inserting "${ch}" at offset ${this.offset} in item ${this.itemId}`);

        // 選択範囲がある場合は、選択範囲を削除してからテキストを挿入
        const selection = Object.values(store.selections).find(s =>
            s.userId === this.userId
            && s.startItemId === this.itemId
            && s.endItemId === this.itemId
        );

        if (selection && selection.startOffset !== selection.endOffset) {
            const startOffset = Math.min(selection.startOffset, selection.endOffset);
            const endOffset = Math.max(selection.startOffset, selection.endOffset);
            // Y.Text の範囲置換: delete -> insert
            ytext.delete(startOffset, endOffset - startOffset);
            ytext.insert(startOffset, ch);

            // カーソル位置を更新
            this.offset = startOffset + ch.length;

            // 選択範囲をクリア
            this.clearSelection();
        } else {
            // 通常の挿入
            ytext.insert(this.offset, ch);
            this.offset += ch.length;
        }

        this.applyToStore();

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
        this.resetInitialColumn();

        const node = this.findTarget();
        if (!node) return;

        const ytext = (node as Item).text as Y.Text;

        // 選択範囲がある場合は、選択範囲を削除
        const selection = Object.values(store.selections).find(s => s.userId === this.userId);

        if (selection && selection.startOffset !== selection.endOffset) {
            // 複数アイテムにまたがる選択範囲の場合
            if (selection.startItemId !== selection.endItemId) {
                this.deleteMultiItemSelection(selection);
                return;
            }

            // 単一アイテム内の選択範囲の場合
            if (selection.startItemId === this.itemId && selection.endItemId === this.itemId) {
                const startOffset = Math.min(selection.startOffset, selection.endOffset);
                const endOffset = Math.max(selection.startOffset, selection.endOffset);
                // 選択範囲のテキストを削除
                ytext.delete(startOffset, endOffset - startOffset);

                // カーソル位置を更新
                this.offset = startOffset;

                // 選択範囲をクリア
                this.clearSelection();
            }
        } else {
            // 通常の削除
            if (this.offset > 0) {
                const pos = this.offset - 1;
                ytext.delete(pos, 1);
                this.offset = Math.max(0, this.offset - 1);
            } else {
                // 行頭で前アイテムとの結合
                this.mergeWithPreviousItem();
            }
        }

        this.applyToStore();

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
        this.resetInitialColumn();

        const node = this.findTarget();
        if (!node) return;

        const ytext = (node as Item).text as Y.Text;

        // 選択範囲がある場合は、選択範囲を削除
        const selection = Object.values(store.selections).find(s => s.userId === this.userId);

        if (selection && selection.startOffset !== selection.endOffset) {
            // 複数アイテムにまたがる選択範囲の場合
            if (selection.startItemId !== selection.endItemId) {
                this.deleteMultiItemSelection(selection);
                return;
            }

            // 単一アイテム内の選択範囲の場合
            if (selection.startItemId === this.itemId && selection.endItemId === this.itemId) {
                const startOffset = Math.min(selection.startOffset, selection.endOffset);
                const endOffset = Math.max(selection.startOffset, selection.endOffset);
                // 選択範囲のテキストを削除
                ytext.delete(startOffset, endOffset - startOffset);

                // カーソル位置を更新
                this.offset = startOffset;

                // 選択範囲をクリア
                this.clearSelection();
            }
        } else {
            // 通常の削除
            if (this.offset < ytext.length) {
                ytext.delete(this.offset, 1);
            } else {
                // 行末の場合
                const len = ytext.length;
                // アイテムが空の場合はアイテム自体を削除
                if (len === 0) {
                    this.deleteEmptyItem();
                    return;
                }
                // 空でない場合は次アイテムとの結合
                this.mergeWithNextItem();
            }
        }

        this.applyToStore();

        // onEdit コールバックを呼び出す
        store.triggerOnEdit();

        // グローバルテキストエリアの値も同期
        const textarea = store.getTextareaRef();
        if (textarea) {
            textarea.value = ytext.toString();
            textarea.setSelectionRange(this.offset, this.offset);
            console.log(`deleteForward: Synced textarea value: "${textarea.value}"`);
        }
    }

    /**
     * 前のアイテムと結合する
     */
    private mergeWithPreviousItem() {
        const currentItem = this.findTarget();
        if (!currentItem) return;

        const prevItem = this.findPreviousItem();
        if (!prevItem) return;

        // 前のアイテムのテキストを取得
        const prevText = prevItem.text || "";
        const currentText = currentItem.text || "";

        // 前のアイテムのテキストを更新
        prevItem.updateText(prevText + currentText);

        // 現在のアイテムを削除
        currentItem.delete();

        // カーソル位置を更新
        const oldItemId = this.itemId;
        this.itemId = prevItem.id;
        this.offset = prevText.length;

        // 古いアイテムのカーソルをクリア（アイテム削除後）
        store.clearCursorForItem(oldItemId);

        // アクティブアイテムを設定
        store.setActiveItem(this.itemId);

        // カーソルの点滅を開始
        store.startCursorBlink();
    }

    /**
     * 次のアイテムと結合する
     */
    private mergeWithNextItem() {
        const currentItem = this.findTarget();
        if (!currentItem) return;

        const nextItem = this.findNextItem();
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
    private deleteEmptyItem() {
        const currentItem = this.findTarget();
        if (!currentItem) return;

        // アイテムが空でない場合は何もしない
        if (currentItem.text && currentItem.text.length > 0) return;

        // 次のアイテムを探す
        const nextItem = this.findNextItem();

        // カーソルを移動する先を決定
        let targetItemId: string;
        let targetOffset: number;

        if (nextItem) {
            // 次のアイテムがある場合は次のアイテムの先頭に移動
            targetItemId = nextItem.id;
            targetOffset = 0;
        } else {
            // 次のアイテムがない場合は前のアイテムの末尾に移動
            const prevItem = this.findPreviousItem();
            if (prevItem) {
                targetItemId = prevItem.id;
                targetOffset = prevItem.text ? prevItem.text.length : 0;
            } else {
                // 前のアイテムもない場合（最後の1つのアイテム）は削除しない
                return;
            }
        }

        // 現在のアイテムのカーソルをクリア
        store.clearCursorForItem(this.itemId);

        // アイテムを削除
        currentItem.delete();

        // 新しい位置にカーソルを設定
        this.itemId = targetItemId;
        this.offset = targetOffset;

        // ストアを更新
        store.setActiveItem(this.itemId);
        store.setCursor({
            itemId: this.itemId,
            offset: this.offset,
            isActive: true,
            userId: this.userId,
        });

        // カーソル点滅を開始
        store.startCursorBlink();
    }

    insertLineBreak() {
        const target = this.findTarget();
        if (!target) return;

        const text = target.text || "";

        // カーソル位置でテキストを分割
        const beforeText = text.slice(0, this.offset);
        const afterText = text.slice(this.offset);

        // タイトルかどうかを判断
        const isPageTitle = TreeViewManager.isPageItem(target);

        if (isPageTitle) {
            // タイトルの場合は最初の子として追加
            if (target.items && Tree.is(target.items, Items)) {
                // 現在のアイテムのテキストを更新（カーソル位置より前のテキスト）
                target.updateText(beforeText);

                // 新しいアイテムを作成（カーソル位置より後のテキスト）
                const newItem = target.items.addNode(this.userId, 0);
                newItem.updateText(afterText);

                // カーソルを新しいアイテムの先頭に移動
                const oldItemId = this.itemId;

                // 全てのカーソルをクリアして単一カーソルモードを維持
                store.clearCursorAndSelection(this.userId);

                // 新しいアイテムとオフセットを設定
                this.itemId = newItem.id;
                this.offset = 0;

                // アクティブアイテムを更新
                store.setActiveItem(this.itemId);

                // カーソル点滅を開始
                store.startCursorBlink();

                // カスタムイベントを発行
                if (typeof document !== "undefined") {
                    const event = new CustomEvent("navigate-to-item", {
                        bubbles: true,
                        detail: { direction: "enter", fromItemId: target.id, toItemId: this.itemId },
                    });
                    document.dispatchEvent(event);
                }

                this.applyToStore();
                return;
            }
        } else {
            // 通常のアイテムの場合は兄弟として追加
            const parent = Tree.parent(target);
            if (parent && Tree.is(parent, Items)) {
                // 現在のアイテムのインデックスを取得
                const currentIndex = parent.indexOf(target);

                // 現在のアイテムのテキストを更新（カーソル位置より前のテキスト）
                target.updateText(beforeText);

                // 新しいアイテムを作成（カーソル位置より後のテキスト）
                const newItem = parent.addNode(this.userId, currentIndex + 1);
                newItem.updateText(afterText);

                // カーソルを新しいアイテムの先頭に移動
                const oldItemId = this.itemId;

                // 全てのカーソルをクリアして単一カーソルモードを維持
                store.clearCursorAndSelection(this.userId);

                // 新しいアイテムとオフセットを設定
                this.itemId = newItem.id;
                this.offset = 0;

                // アクティブアイテムを更新
                store.setActiveItem(this.itemId);

                // カーソル点滅を開始
                store.startCursorBlink();

                // カスタムイベントを発行
                if (typeof document !== "undefined") {
                    const event = new CustomEvent("navigate-to-item", {
                        bubbles: true,
                        detail: { direction: "enter", fromItemId: target.id, toItemId: this.itemId },
                    });
                    document.dispatchEvent(event);
                }

                this.applyToStore();
                return;
            }
        }

        // 親アイテムが見つからない場合は通常の改行を挿入
        this.insertText("\n");
    }

    onInput(event: InputEvent) {
        const data = event.data;
        console.log(`Cursor.onInput called for item ${this.itemId}, data: "${data}", inputType: ${event.inputType}`);
        console.log(
            `Cursor.onInput: Current cursor state - itemId: ${this.itemId}, offset: ${this.offset}, isActive: ${this.isActive}`,
        );

        // 注意: マルチカーソル環境では、グローバルテキストエリアの値を使って
        // SharedTreeを更新してはいけない。テキストエリアは単一のアイテムの状態を
        // 表すものではなく、複数のカーソルが同時に編集している可能性がある。

        // 代わりに、InputEventのdataを使って適切にテキストを挿入する
        if (data && data.length > 0) {
            console.log(`Inserting text from input event: "${data}"`);
            this.insertText(data);
        } else {
            console.log(`No data in input event, skipping text insertion`);
        }
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
        const hasSelection = Object.values(store.selections).some(s =>
            s.userId === this.userId
            && (s.startOffset !== s.endOffset || s.startItemId !== s.endItemId)
        );

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Has selection: ${hasSelection}`);
            if (hasSelection) {
                console.log(`Selections:`, Object.values(store.selections).filter(s => s.userId === this.userId));
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
                        const selection = Object.values(store.selections).find(s => s.userId === this.userId);
                        if (selection) {
                            // 複数アイテムにまたがる選択範囲の場合
                            if (selection.startItemId !== selection.endItemId) {
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
                        const selection = Object.values(store.selections).find(s => s.userId === this.userId);
                        if (selection) {
                            // 複数アイテムにまたがる選択範囲の場合
                            if (selection.startItemId !== selection.endItemId) {
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
                        const selection = Object.values(store.selections).find(s => s.userId === this.userId);
                        if (selection) {
                            // 複数アイテムにまたがる選択範囲の場合
                            if (selection.startItemId !== selection.endItemId) {
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
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId)
            && s.userId === this.userId
        );

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
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを左に移動
                this.moveLeft();

                startItemId = this.itemId;
                startOffset = this.offset;
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
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId)
            && s.userId === this.userId
        );

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
    extendSelectionUp() {
        const target = this.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId)
            && s.userId === this.userId
        );

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
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId)
            && s.userId === this.userId
        );

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
            const oldOffset = this.offset;

            // カーソルを下に移動
            this.moveDown();

            // 移動先が同じアイテム内の場合は、全テキストを選択
            if (this.itemId === oldItemId) {
                const text = target.text || "";
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
            const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
            const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);
            const startIdx = allItemIds.indexOf(startItemId);
            const endIdx = allItemIds.indexOf(endItemId);

            // インデックスが見つからない場合はデフォルトで正方向
            if (startIdx === -1 || endIdx === -1) {
                isReversed = false;
            } else {
                isReversed = startIdx > endIdx;
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

    // カーソルを行の先頭に移動
    moveToLineStart() {
        const target = this.findTarget();
        if (!target) return;

        const text = target.text || "";
        const currentLineIndex = this.getCurrentLineIndex(text, this.offset);

        // 現在の行の開始位置に移動
        this.offset = this.getLineStartOffset(text, currentLineIndex);
        this.applyToStore();

        // カーソルが正しく更新されたことを確認
        store.startCursorBlink();
    }

    // カーソルを行の末尾に移動
    moveToLineEnd() {
        const target = this.findTarget();
        if (!target) return;

        const text = target.text || "";
        const currentLineIndex = this.getCurrentLineIndex(text, this.offset);

        // 現在の行の終了位置に移動
        this.offset = this.getLineEndOffset(text, currentLineIndex);
        this.applyToStore();

        // カーソルが正しく更新されたことを確認
        store.startCursorBlink();
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
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId)
            && s.userId === this.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = target.text || "";
        const currentLineIndex = this.getCurrentLineIndex(text, this.offset);
        const lineStartOffset = this.getLineStartOffset(text, currentLineIndex);

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
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId)
            && s.userId === this.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = target.text || "";
        const currentLineIndex = this.getCurrentLineIndex(text, this.offset);
        const lineEndOffset = this.getLineEndOffset(text, currentLineIndex);

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
        const selections = Object.values(store.selections).filter(s => s.userId === this.userId);
        if (selections.length > 0) {
            // 選択範囲を削除
            store.selections = Object.fromEntries(
                Object.entries(store.selections).filter(([_, s]) => s.userId !== this.userId),
            );
            // カーソル点滅を開始
            store.startCursorBlink();
        }
    }

    // --- Extended navigation commands ---

    // 単語単位で左へ移動
    moveWordLeft() {
        const target = this.findTarget();
        if (!target) return;

        const text = target.text || "";
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

        const text = target.text || "";
        let pos = this.offset;
        const len = text.length;
        if (pos < len) {
            while (pos < len && /\s/.test(text[pos])) pos++;
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
        const text = target.text || "";
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

        const text = target.text || "";

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

        const text = target.text || "";
        const selection = Object.values(store.selections).find(s => s.userId === this.userId);

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
        const selection = Object.values(store.selections).find(s => s.userId === this.userId);
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

        const text = target.text || "";
        const currentLineIndex = this.getCurrentLineIndex(text, this.offset);
        const startOffset = this.getLineStartOffset(text, currentLineIndex);
        const endOffset = this.getLineEndOffset(text, currentLineIndex);

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
        const selection = Object.values(store.selections).find(s => s.userId === this.userId);
        if (!selection) return;

        // 同一アイテム内の選択範囲の場合
        if (selection.startItemId === selection.endItemId) {
            const target = this.findTarget();
            if (!target) return;

            const text = target.text || "";
            const startOffset = Math.min(selection.startOffset, selection.endOffset);
            const endOffset = Math.max(selection.startOffset, selection.endOffset);

            // 選択範囲のテキストを取得
            const selectedText = text.substring(startOffset, endOffset);

            // クリップボードにコピー（ブラウザのデフォルト動作に任せる）
            // 実際のコピーはブラウザが行うので、ここでは何もしない
            return;
        }

        // 複数アイテムにまたがる選択範囲の場合
        // 実際のコピーはEditorOverlay.svelteのhandleCopyで処理されるため、
        // ここでは何もしない
    }

    /**
     * 選択されたテキストをカットする
     */
    cutSelectedText() {
        const selection = Object.values(store.selections).find(s => s.userId === this.userId);
        if (!selection) return;

        // 同一アイテム内の選択範囲の場合
        if (selection.startItemId === selection.endItemId) {
            const target = this.findTarget();
            if (!target) return;

            const text = target.text || "";
            const startOffset = Math.min(selection.startOffset, selection.endOffset);
            const endOffset = Math.max(selection.startOffset, selection.endOffset);

            // 選択範囲のテキストを取得
            const selectedText = text.substring(startOffset, endOffset);

            // テキストを削除
            const newText = text.substring(0, startOffset) + text.substring(endOffset);
            target.updateText(newText);

            // カーソル位置を更新
            this.offset = startOffset;
            this.applyToStore();

            // 選択範囲をクリア
            this.clearSelection();

            // カーソル点滅を開始
            store.startCursorBlink();

            // クリップボードにコピー（ブラウザのデフォルト動作に任せる）
            // 実際のコピーはブラウザが行うので、ここでは何もしない
            return;
        }

        // 複数アイテムにまたがる選択範囲の場合
        this.deleteMultiItemSelection(selection);
    }

    /**
     * 複数アイテムにまたがる選択範囲を削除する
     */
    deleteMultiItemSelection(selection: any) {
        if (!selection) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`deleteMultiItemSelection called for selection:`, selection);
        }

        // 選択範囲の開始と終了アイテムが同じ場合は単一アイテム削除を使用
        if (selection.startItemId === selection.endItemId) {
            this.deleteSelection();
            return;
        }

        // 選択範囲の開始と終了アイテムを取得
        const startItem = this.searchItem(generalStore.currentPage!, selection.startItemId);
        const endItem = this.searchItem(generalStore.currentPage!, selection.endItemId);

        if (!startItem || !endItem) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Start or end item not found: startItem=${startItem}, endItem=${endItem}`);
            }
            return;
        }

        // 選択範囲の方向を考慮して、実際の開始と終了を決定
        const isReversed = selection.isReversed || false;

        // 選択範囲の方向に基づいて、実際の開始と終了アイテムを決定
        let firstItem, lastItem, firstOffset, lastOffset;

        // DOM上の順序を取得
        const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
        const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);

        const startIdx = allItemIds.indexOf(selection.startItemId);
        const endIdx = allItemIds.indexOf(selection.endItemId);

        if (startIdx === -1 || endIdx === -1) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Start or end item not found in DOM: startIdx=${startIdx}, endIdx=${endIdx}`);
            }
            return;
        }

        // DOM上の順序に基づいて、最初と最後のアイテムを決定
        if (startIdx <= endIdx) {
            firstItem = startItem;
            lastItem = endItem;
            firstOffset = selection.startOffset;
            lastOffset = selection.endOffset;
        } else {
            firstItem = endItem;
            lastItem = startItem;
            firstOffset = selection.endOffset;
            lastOffset = selection.startOffset;
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection direction: ${isReversed ? "reversed" : "forward"}`);
            console.log(`First item: ${firstItem.id}, offset: ${firstOffset}`);
            console.log(`Last item: ${lastItem.id}, offset: ${lastOffset}`);
        }

        // アイテムのリストを取得
        const root = generalStore.currentPage;
        if (!root) return;

        // アイテムの親を取得
        const startParent = Tree.parent(firstItem);
        const endParent = Tree.parent(lastItem);

        // 親が異なる場合は処理を中止（現在はサポート外）
        if (startParent !== endParent || !Tree.is(startParent, Items)) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Parents are different or not Items: startParent=${startParent}, endParent=${endParent}`);
            }
            return;
        }

        const items = startParent as Items;
        const firstIndex = items.indexOf(firstItem);
        const lastIndex = items.indexOf(lastItem);

        if (firstIndex === -1 || lastIndex === -1) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`First or last index not found: firstIndex=${firstIndex}, lastIndex=${lastIndex}`);
            }
            return;
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`First index: ${firstIndex}, Last index: ${lastIndex}`);
        }

        try {
            // 開始アイテムのテキストを更新（選択範囲の前半部分を保持）
            const firstText = firstItem.text || "";
            const newFirstText = firstText.substring(0, firstOffset);

            // 終了アイテムのテキストを更新（選択範囲の後半部分を保持）
            const lastText = lastItem.text || "";
            const newLastText = lastText.substring(lastOffset);

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`First text: "${firstText}", New first text: "${newFirstText}"`);
                console.log(`Last text: "${lastText}", New last text: "${newLastText}"`);
                console.log(`Combined text will be: "${newFirstText + newLastText}"`);
            }

            // 削除するアイテムのIDを保存
            const itemsToRemove = [];
            for (let i = firstIndex + 1; i <= lastIndex; i++) {
                const item = items.at(i);
                if (item) {
                    itemsToRemove.push(item.id);
                }
            }

            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Items to remove: ${itemsToRemove.join(", ")}`);
            }

            // 削除前に、削除対象アイテムのカーソルをクリア
            for (const itemId of itemsToRemove) {
                store.clearCursorForItem(itemId);
            }

            // 開始アイテムに終了アイテムの残りのテキストを追加
            firstItem.updateText(newFirstText + newLastText);

            // 実際の削除処理（終了アイテムから開始アイテムの次まで）
            // 削除は終了アイテムから開始アイテムの方向に行う
            for (let i = lastIndex; i > firstIndex; i--) {
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Removing item at index ${i}`);
                }
                items.removeAt(i);
            }

            // カーソル位置を更新
            this.itemId = firstItem.id;
            this.offset = firstOffset;
            this.applyToStore();

            // 選択範囲をクリア
            this.clearSelection();

            // アクティブアイテムを設定
            store.setActiveItem(this.itemId);

            // カーソル点滅を開始
            store.startCursorBlink();

            // カーソルが表示されていることを確認
            if (typeof window !== "undefined") {
                setTimeout(() => {
                    const cursorVisible = document.querySelector(".editor-overlay .cursor") !== null;
                    if (!cursorVisible) {
                        // カーソルが表示されていない場合は、再度カーソルを設定
                        this.applyToStore();
                        store.startCursorBlink();
                    }
                }, 150); // タイムアウトを150msに増やして、DOMの更新を待つ時間を長くする
            }

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`After deletion: cursor at itemId=${this.itemId}, offset=${this.offset}`);
                console.log(`Remaining items count: ${items.length}`);
                console.log(`Updated first item text: "${firstItem.text}"`);
            }
        } catch (error) {
            // エラーが発生した場合はログに出力
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Error in deleteMultiItemSelection:`, error);
                // エラーの詳細情報を出力
                if (error instanceof Error) {
                    console.error(`Error message: ${error.message}`);
                    console.error(`Error stack: ${error.stack}`);
                }
            }

            // 選択範囲をクリア
            this.clearSelection();

            // カーソル点滅を開始
            store.startCursorBlink();

            // エラーが発生した場合でも、カーソルを表示する
            this.applyToStore();
        }
    }

    /**
     * 選択範囲を削除する
     */
    deleteSelection() {
        const selection = Object.values(store.selections).find(s => s.userId === this.userId);
        if (!selection) return;

        // 複数アイテムにまたがる選択範囲の場合
        if (selection.startItemId !== selection.endItemId) {
            this.deleteMultiItemSelection(selection);
            return;
        }

        // 単一アイテム内の選択範囲の場合
        const target = this.findTarget();
        if (!target) return;

        const startOffset = Math.min(selection.startOffset, selection.endOffset);
        const endOffset = Math.max(selection.startOffset, selection.endOffset);

        // Y.Text で削除
        const ytext = (target as any).text as any;
        ytext.delete(startOffset, endOffset - startOffset);

        // カーソル位置を更新
        this.offset = startOffset;
        this.applyToStore();

        // 選択範囲をクリア
        this.clearSelection();

        // カーソル点滅を開始
        store.startCursorBlink();
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
        const currentText = currentTarget?.text || "";
        const currentColumn = this.getCurrentColumn(currentText, this.offset);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Current column: ${currentColumn}, current text: "${currentText}"`);
        }

        // アイテム間移動の処理
        if (direction === "left") {
            const prevItem = this.findPreviousItem();
            if (prevItem) {
                newItemId = prevItem.id;
                newOffset = prevItem.text?.length || 0;
                itemChanged = true;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moving left to previous item: id=${prevItem.id}, offset=${newOffset}`);
                }
            } else {
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
            const nextItem = this.findNextItem();
            if (nextItem) {
                newItemId = nextItem.id;
                newOffset = 0;
                itemChanged = true;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moving right to next item: id=${nextItem.id}, offset=${newOffset}`);
                }
            } else {
                // 次のアイテムがない場合は、同じアイテムの末尾に移動
                const target = this.findTarget();
                if (target) {
                    newOffset = target.text?.length || 0;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "up") {
            const prevItem = this.findPreviousItem();
            if (prevItem) {
                newItemId = prevItem.id;
                const prevText = prevItem.text || "";
                const prevLines = prevText.split("\n");
                const lastLineIndex = prevLines.length - 1;
                const lastLineStart = this.getLineStartOffset(prevText, lastLineIndex);
                const lastLineEnd = this.getLineEndOffset(prevText, lastLineIndex);
                const lastLineLength = lastLineEnd - lastLineStart;

                // x座標の変化が最も小さい位置を計算
                // 初期列位置または現在の列位置に最も近い位置を選択
                // 前のアイテムの最後の行の長さを超えないようにする
                const targetColumn = Math.min(
                    this.initialColumn !== null ? this.initialColumn : currentColumn,
                    lastLineLength,
                );
                newOffset = lastLineStart + targetColumn;

                // 特殊ケース: 現在のカーソルが行の先頭（オフセット0）にある場合は、
                // 前のアイテムの最後の行の先頭に移動
                if (this.offset === 0) {
                    newOffset = lastLineStart;
                }

                itemChanged = true;

                // デバッグ情報
                console.log(
                    `navigateToItem up - Moving to previous item's last line: itemId=${prevItem.id}, offset=${newOffset}, targetColumn=${targetColumn}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}`,
                );
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Moving up to previous item's last line: id=${prevItem.id}, lastLineIndex=${lastLineIndex}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}`,
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
            const nextItem = this.findNextItem();
            if (nextItem) {
                newItemId = nextItem.id;
                const nextText = nextItem.text || "";
                const nextLines = nextText.split("\n");
                const firstLineIndex = 0;
                const firstLineStart = this.getLineStartOffset(nextText, firstLineIndex);
                const firstLineEnd = this.getLineEndOffset(nextText, firstLineIndex);
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
                const currentText = currentTarget?.text || "";
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
                    newOffset = target.text?.length || 0;

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
            const cursorsToRemove = Object.values(store.cursors)
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
            const cursorsInTargetItem = Object.values(store.cursors)
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
        const endItemText = endItemEl.textContent || "";

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
        this.applyScrapboxFormatting("bold");
    }

    /**
     * 選択範囲のテキストを斜体に変更する（Scrapbox構文: [/ text]）
     */
    formatItalic() {
        this.applyScrapboxFormatting("italic");
    }

    /**
     * 選択範囲のテキストに下線を追加する（HTML タグを使用）
     */
    formatUnderline() {
        this.applyScrapboxFormatting("underline");
    }

    /**
     * 選択範囲のテキストに取り消し線を追加する（Scrapbox構文: [- text]）
     */
    formatStrikethrough() {
        this.applyScrapboxFormatting("strikethrough");
    }

    /**
     * 選択範囲のテキストをコードに変更する（Scrapbox構文: `text`）
     */
    formatCode() {
        this.applyScrapboxFormatting("code");
    }

    /**
     * 選択範囲にフォーマットを適用する共通メソッド
     * @param markdownPrefix Markdown形式のプレフィックス
     * @param markdownSuffix Markdown形式のサフィックス
     * @param scrapboxPrefix Scrapbox形式のプレフィックス
     * @param scrapboxSuffix Scrapbox形式のサフィックス
     */
    private applyFormatting(
        markdownPrefix: string,
        markdownSuffix: string,
        scrapboxPrefix: string,
        scrapboxSuffix: string,
    ) {
        // Scrapbox構文を使用
        const prefix = scrapboxPrefix;
        const suffix = scrapboxSuffix;

        // 選択範囲を取得
        const selection = Object.values(store.selections).find(s => s.userId === this.userId);

        if (!selection || selection.startOffset === selection.endOffset) {
            // 選択範囲がない場合は何もしない
            return;
        }

        // 複数アイテムにまたがる選択範囲の場合
        if (selection.startItemId !== selection.endItemId) {
            this.applyFormattingToMultipleItems(selection, prefix, suffix);
            return;
        }

        // 単一アイテム内の選択範囲の場合
        const target = this.findTarget();
        if (!target) return;

        const text = target.text || "";
        const startOffset = Math.min(selection.startOffset, selection.endOffset);
        const endOffset = Math.max(selection.startOffset, selection.endOffset);
        const selectedText = text.substring(startOffset, endOffset);

        // フォーマット済みのテキストを作成
        const formattedText = prefix + selectedText + suffix;

        // テキストを更新
        const newText = text.substring(0, startOffset) + formattedText + text.substring(endOffset);
        target.updateText(newText);

        // カーソル位置を更新（選択範囲の終了位置に設定）
        this.offset = startOffset + formattedText.length;
        this.applyToStore();

        // 選択範囲をクリア
        this.clearSelection();

        // カーソル点滅を開始
        store.startCursorBlink();
    }

    /**
     * 選択範囲にScrapbox構文のフォーマットを適用する
     * @param formatType フォーマットの種類（'bold', 'italic', 'strikethrough', 'underline', 'code'）
     */
    private applyScrapboxFormatting(formatType: "bold" | "italic" | "strikethrough" | "underline" | "code") {
        // 選択範囲を取得
        const selection = Object.values(store.selections).find(s => s.userId === this.userId);

        if (!selection || selection.startOffset === selection.endOffset) {
            // 選択範囲がない場合は何もしない
            return;
        }

        // 複数アイテムにまたがる選択範囲の場合
        if (selection.startItemId !== selection.endItemId) {
            this.applyScrapboxFormattingToMultipleItems(selection, formatType);
            return;
        }

        // 単一アイテム内の選択範囲の場合
        const target = this.findTarget();
        if (!target) return;

        const text = target.text || "";
        const startOffset = Math.min(selection.startOffset, selection.endOffset);
        const endOffset = Math.max(selection.startOffset, selection.endOffset);
        const selectedText = text.substring(startOffset, endOffset);

        // フォーマット済みのテキストを作成
        let formattedText = "";
        switch (formatType) {
            case "bold":
                formattedText = ScrapboxFormatter.bold(selectedText);
                break;
            case "italic":
                formattedText = ScrapboxFormatter.italic(selectedText);
                break;
            case "strikethrough":
                formattedText = ScrapboxFormatter.strikethrough(selectedText);
                break;
            case "underline":
                formattedText = ScrapboxFormatter.underline(selectedText);
                break;
            case "code":
                formattedText = ScrapboxFormatter.code(selectedText);
                break;
        }

        // テキストを更新
        const newText = text.substring(0, startOffset) + formattedText + text.substring(endOffset);
        target.updateText(newText);

        // カーソル位置を更新（選択範囲の終了位置に設定）
        this.offset = startOffset + formattedText.length;
        this.applyToStore();

        // 選択範囲をクリア
        this.clearSelection();

        // カーソル点滅を開始
        store.startCursorBlink();
    }

    /**
     * 複数アイテムにまたがる選択範囲にフォーマットを適用する
     */
    private applyFormattingToMultipleItems(selection: any, prefix: string, suffix: string) {
        // 開始アイテムと終了アイテムのIDを取得
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;
        const startOffset = selection.startOffset;
        const endOffset = selection.endOffset;
        const isReversed = selection.isReversed;

        // 全アイテムのIDを取得
        const allItemElements = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
        const allItemIds = allItemElements.map(el => el.getAttribute("data-item-id")!);

        // 開始アイテムと終了アイテムのインデックスを取得
        const startIdx = allItemIds.indexOf(startItemId);
        const endIdx = allItemIds.indexOf(endItemId);

        if (startIdx === -1 || endIdx === -1) return;

        // 開始インデックスと終了インデックスを正規化
        const firstIdx = Math.min(startIdx, endIdx);
        const lastIdx = Math.max(startIdx, endIdx);

        // 選択範囲内の各アイテムにフォーマットを適用
        for (let i = firstIdx; i <= lastIdx; i++) {
            const itemId = allItemIds[i];
            const item = this.searchItem(generalStore.currentPage!, itemId);

            if (!item) continue;

            const text = item.text || "";

            // アイテムの位置に応じてフォーマットを適用
            if (i === firstIdx && i === lastIdx) {
                // 単一アイテム内の選択範囲
                const start = isReversed ? endOffset : startOffset;
                const end = isReversed ? startOffset : endOffset;
                const selectedText = text.substring(start, end);
                const formattedText = prefix + selectedText + suffix;
                const newText = text.substring(0, start) + formattedText + text.substring(end);
                item.updateText(newText);
            } else if (i === firstIdx) {
                // 開始アイテム
                const start = isReversed ? text.length : startOffset;
                const end = text.length;
                const selectedText = text.substring(start, end);
                const formattedText = prefix + selectedText + (i === lastIdx - 1 ? suffix : "");
                const newText = text.substring(0, start) + formattedText;
                item.updateText(newText);
            } else if (i === lastIdx) {
                // 終了アイテム
                const start = 0;
                const end = isReversed ? startOffset : endOffset;
                const selectedText = text.substring(start, end);
                const formattedText = (i === firstIdx + 1 ? prefix : "") + selectedText + suffix;
                const newText = formattedText + text.substring(end);
                item.updateText(newText);
            } else {
                // 中間アイテム
                item.updateText(prefix + text + suffix);
            }
        }

        // カーソル位置を更新（選択範囲の終了位置に設定）
        this.itemId = isReversed ? startItemId : endItemId;
        this.offset = isReversed ? startOffset : endOffset;
        this.applyToStore();

        // 選択範囲をクリア
        this.clearSelection();

        // カーソル点滅を開始
        store.startCursorBlink();
    }

    /**
     * 複数アイテムにまたがる選択範囲にScrapbox構文のフォーマットを適用する
     */
    private applyScrapboxFormattingToMultipleItems(
        selection: any,
        formatType: "bold" | "italic" | "strikethrough" | "underline" | "code",
    ) {
        // 開始アイテムと終了アイテムのIDを取得
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;
        const startOffset = selection.startOffset;
        const endOffset = selection.endOffset;
        const isReversed = selection.isReversed;

        // 全アイテムのIDを取得
        const allItemElements = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
        const allItemIds = allItemElements.map(el => el.getAttribute("data-item-id")!);

        // 開始アイテムと終了アイテムのインデックスを取得
        const startIdx = allItemIds.indexOf(startItemId);
        const endIdx = allItemIds.indexOf(endItemId);

        if (startIdx === -1 || endIdx === -1) return;

        // 開始インデックスと終了インデックスを正規化
        const firstIdx = Math.min(startIdx, endIdx);
        const lastIdx = Math.max(startIdx, endIdx);

        // 選択範囲内の各アイテムにフォーマットを適用
        for (let i = firstIdx; i <= lastIdx; i++) {
            const itemId = allItemIds[i];
            const item = this.searchItem(generalStore.currentPage!, itemId);

            if (!item) continue;

            const text = item.text || "";

            // アイテムの位置に応じてフォーマットを適用
            if (i === firstIdx && i === lastIdx) {
                // 単一アイテム内の選択範囲
                const start = isReversed ? endOffset : startOffset;
                const end = isReversed ? startOffset : endOffset;
                const selectedText = text.substring(start, end);

                // フォーマット済みのテキストを作成
                let formattedText = "";
                switch (formatType) {
                    case "bold":
                        formattedText = ScrapboxFormatter.bold(selectedText);
                        break;
                    case "italic":
                        formattedText = ScrapboxFormatter.italic(selectedText);
                        break;
                    case "strikethrough":
                        formattedText = ScrapboxFormatter.strikethrough(selectedText);
                        break;
                    case "underline":
                        formattedText = ScrapboxFormatter.underline(selectedText);
                        break;
                    case "code":
                        formattedText = ScrapboxFormatter.code(selectedText);
                        break;
                }

                const newText = text.substring(0, start) + formattedText + text.substring(end);
                item.updateText(newText);
            } else {
                // 複数アイテムにまたがる選択範囲の場合は、各アイテムを個別に処理
                // 現在は単一アイテム内の選択範囲のみサポート
                // 将来的に複数アイテムにまたがる選択範囲のフォーマットをサポートする場合は、
                // ここに実装を追加する
            }
        }

        // カーソル位置を更新（選択範囲の終了位置に設定）
        this.itemId = isReversed ? startItemId : endItemId;
        this.offset = isReversed ? startOffset : endOffset;
        this.applyToStore();

        // 選択範囲をクリア
        this.clearSelection();

        // カーソル点滅を開始
        store.startCursorBlink();
    }
}
