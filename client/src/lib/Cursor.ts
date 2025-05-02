import { Tree } from "fluid-framework";
import type { Item } from "../schema/app-schema";
import { Items } from "../schema/app-schema";
import { TreeViewManager } from "../fluid/TreeViewManager";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";

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

    constructor(cursorId: string, opts: CursorOptions) {
        this.cursorId = cursorId;
        this.itemId = opts.itemId;
        this.offset = opts.offset;
        this.isActive = opts.isActive;
        this.userId = opts.userId;
    }

    // SharedTree 上の Item を再帰検索
    private findTarget(): Item | undefined {
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

    private applyToStore() {
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
                userId: this.userId
            });
            this.cursorId = cursorId;
        }
    }

    // テキスト内の行数を計算
    private countLines(text: string): number {
        return text.split('\n').length;
    }

    // 指定した行の開始オフセットを取得
    private getLineStartOffset(text: string, lineIndex: number): number {
        const lines = text.split('\n');
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
        const lines = text.split('\n');
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

        const lines = text.split('\n');

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

    moveLeft() {
        const target = this.findTarget();
        if (!target) return;

        if (this.offset > 0) {
            this.offset = Math.max(0, this.offset - 1);
            this.applyToStore();

            // カーソルが正しく更新されたことを確認
            store.startCursorBlink();
        }
        else {
            // 行頭で前アイテムへ移動
            this.navigateToItem("left");
        }
    }

    moveRight() {
        const target = this.findTarget();
        const text = target?.text ?? "";

        // テキストが空でない場合のみオフセットを増加
        if (text.length > 0 && this.offset < text.length) {
            this.offset = this.offset + 1;
            this.applyToStore();

            // カーソルが正しく更新されたことを確認
            store.startCursorBlink();
        }
        else {
            // 行末または空のテキストの場合は次アイテムへ移動
            this.navigateToItem("right");
        }
    }

    moveUp() {
        const target = this.findTarget();
        if (!target) return;

        const text = target.text || "";
        const currentLineIndex = this.getCurrentLineIndex(text, this.offset);
        const currentColumn = this.getCurrentColumn(text, this.offset);

        if (currentLineIndex > 0) {
            // 同じアイテム内の上の行に移動
            const prevLineIndex = currentLineIndex - 1;
            const prevLineStart = this.getLineStartOffset(text, prevLineIndex);
            const prevLineEnd = this.getLineEndOffset(text, prevLineIndex);
            const prevLineLength = prevLineEnd - prevLineStart;

            // 同じ列位置か行の長さの短い方に移動
            this.offset = prevLineStart + Math.min(currentColumn, prevLineLength);
            this.applyToStore();
        } else {
            // 前のアイテムの最後の行に移動
            this.navigateToItem("up");
        }
    }

    moveDown() {
        const target = this.findTarget();
        if (!target) return;

        const text = target.text || "";
        const lines = text.split('\n');
        const currentLineIndex = this.getCurrentLineIndex(text, this.offset);
        const currentColumn = this.getCurrentColumn(text, this.offset);

        if (currentLineIndex < lines.length - 1) {
            // 同じアイテム内の下の行に移動
            const nextLineIndex = currentLineIndex + 1;
            const nextLineStart = this.getLineStartOffset(text, nextLineIndex);
            const nextLineEnd = this.getLineEndOffset(text, nextLineIndex);
            const nextLineLength = nextLineEnd - nextLineStart;

            // 同じ列位置か行の長さの短い方に移動
            this.offset = nextLineStart + Math.min(currentColumn, nextLineLength);
            this.applyToStore();
        } else {
            // 次のアイテムの最初の行に移動
            this.navigateToItem("down");
        }
    }

    insertText(ch: string) {
        const node = this.findTarget();
        if (!node) return;
        let txt = node.text;
        // 複数カーソル考慮は呼び出し側でまとめて行う
        txt = txt.slice(0, this.offset) + ch + txt.slice(this.offset);
        node.updateText(txt);
        this.offset += ch.length;
        this.applyToStore();
    }

    deleteBackward() {
        const node = this.findTarget();
        if (!node) return;
        let txt = node.text;
        if (this.offset > 0) {
            const pos = this.offset - 1;
            txt = txt.slice(0, pos) + txt.slice(pos + 1);
            node.updateText(txt);
            this.offset = Math.max(0, this.offset - 1);
            this.applyToStore();
        }
        else {
            // 行頭で前アイテムへの統合など必要なら実装
        }
    }

    deleteForward() {
        const node = this.findTarget();
        if (!node) return;
        let txt = node.text;
        if (this.offset < txt.length) {
            txt = txt.slice(0, this.offset) + txt.slice(this.offset + 1);
            node.updateText(txt);
            this.applyToStore();
        }
        else {
            // 行末で次アイテムへの統合なら
        }
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
                if (typeof document !== 'undefined') {
                    const event = new CustomEvent('navigate-to-item', {
                        bubbles: true,
                        detail: { direction: "enter", fromItemId: target.id, toItemId: this.itemId }
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
                if (typeof document !== 'undefined') {
                    const event = new CustomEvent('navigate-to-item', {
                        bubbles: true,
                        detail: { direction: "enter", fromItemId: target.id, toItemId: this.itemId }
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
        if (data) {
            this.insertText(data);
        }
    }

    // 選択範囲を左に拡張
    extendSelectionLeft() {
        const target = this.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId) &&
            s.userId === this.userId
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

        // 選択範囲を設定
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed
        });
    }

    // 選択範囲を右に拡張
    extendSelectionRight() {
        const target = this.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId) &&
            s.userId === this.userId
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
            isReversed
        });
    }

    // 選択範囲を上に拡張
    extendSelectionUp() {
        const target = this.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId) &&
            s.userId === this.userId
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
            } else {
                // 正方向の選択範囲の場合、終了位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを上に移動
                this.moveUp();

                startItemId = this.itemId;
                startOffset = this.offset;
                isReversed = false;
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
            isReversed
        });
    }

    // 選択範囲を下に拡張
    extendSelectionDown() {
        const target = this.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId) &&
            s.userId === this.userId
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
            } else {
                // 逆方向の選択範囲の場合、開始位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを下に移動
                this.moveDown();

                startItemId = this.itemId;
                startOffset = this.offset;
                isReversed = true;
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.itemId;
            startOffset = this.offset;

            // カーソルを下に移動
            this.moveDown();

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
            isReversed
        });
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

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId) &&
            s.userId === this.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = target.text || "";
        const currentLineIndex = this.getCurrentLineIndex(text, this.offset);
        const lineStartOffset = this.getLineStartOffset(text, currentLineIndex);

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
            startItemId = this.itemId;
            startOffset = this.offset;

            // 行頭までを選択
            endItemId = this.itemId;
            endOffset = lineStartOffset;
            isReversed = this.offset > lineStartOffset;
        }

        // 選択範囲を設定
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed
        });
    }

    // 選択範囲を行末まで拡張
    extendSelectionToLineEnd() {
        const target = this.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.itemId || s.endItemId === this.itemId) &&
            s.userId === this.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = target.text || "";
        const currentLineIndex = this.getCurrentLineIndex(text, this.offset);
        const lineEndOffset = this.getLineEndOffset(text, currentLineIndex);

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

        // 選択範囲を設定
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed
        });
    }

    private navigateToItem(direction: "left" | "right" | "up" | "down") {
        // 前後アイテムへの移動はストア更新のみ行い、イベント発行はコンポーネントで処理
        const oldItemId = this.itemId;
        let newItemId = this.itemId; // デフォルトは現在のアイテム
        let newOffset = this.offset; // デフォルトは現在のオフセット
        let itemChanged = false;

        // アイテム間移動の処理
        if (direction === "left") {
            const prevItem = this.findPreviousItem();
            if (prevItem) {
                newItemId = prevItem.id;
                newOffset = prevItem.text?.length || 0;
                itemChanged = true;
            }
        } else if (direction === "right") {
            const nextItem = this.findNextItem();
            if (nextItem) {
                newItemId = nextItem.id;
                newOffset = 0;
                itemChanged = true;
            }
        } else if (direction === "up") {
            const prevItem = this.findPreviousItem();
            if (prevItem) {
                newItemId = prevItem.id;
                const prevText = prevItem.text || "";
                const prevLines = prevText.split('\n');
                const lastLineIndex = prevLines.length - 1;
                const lastLineStart = this.getLineStartOffset(prevText, lastLineIndex);
                newOffset = lastLineStart + Math.min(this.getCurrentColumn(prevText, this.offset), prevLines[lastLineIndex].length);
                itemChanged = true;
            }
        } else if (direction === "down") {
            const nextItem = this.findNextItem();
            if (nextItem) {
                newItemId = nextItem.id;
                newOffset = Math.min(this.getCurrentColumn(nextItem.text || "", this.offset), (nextItem.text || "").length);
                itemChanged = true;
            }
        }

        // アイテムが変更された場合のみ処理を実行
        if (itemChanged) {
            // 古いアイテムのカーソルを確実に削除
            store.clearCursorForItem(oldItemId);

            // 全てのカーソルをクリアして単一カーソルモードを維持
            store.clearCursorAndSelection(this.userId);

            // 新しいアイテムとオフセットを設定
            this.itemId = newItemId;
            this.offset = newOffset;

            // アクティブアイテムを更新
            store.setActiveItem(this.itemId);

            // 新しいカーソルを作成（既存のカーソルを削除した後に新しいカーソルを作成）
            const cursorId = store.setCursor({
                itemId: this.itemId,
                offset: this.offset,
                isActive: true,
                userId: this.userId
            });

            // cursorIdを更新
            this.cursorId = cursorId;

            // カーソル点滅を開始
            store.startCursorBlink();

            // カスタムイベントを発行
            if (typeof document !== 'undefined') {
                const event = new CustomEvent('navigate-to-item', {
                    bubbles: true,
                    detail: { direction, fromItemId: oldItemId, toItemId: this.itemId }
                });
                document.dispatchEvent(event);
            }
        } else {
            // アイテムが変更されなかった場合でも、カーソルの状態を更新
            this.applyToStore();
            store.startCursorBlink();
        }
    }
}
