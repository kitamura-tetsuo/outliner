import type { Item } from "../schema/app-schema";
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

    private searchItem(node: Item, id: string): Item | undefined {
        if (node.id === id) return node;
        for (const child of node.items as Iterable<Item>) {
            const found = this.searchItem(child, id);
            if (found) return found;
        }
        return undefined;
    }

    private applyToStore() {
        store.updateCursor({
            cursorId: this.cursorId,
            itemId: this.itemId,
            offset: this.offset,
            isActive: this.isActive,
            userId: this.userId,
        });
    }

    moveLeft() {
        if (this.offset > 0) {
            this.offset = Math.max(0, this.offset - 1);
        }
        else {
            // 行頭で前アイテムへ移動
            this.navigateToItem("left");
        }
        this.applyToStore();
    }

    moveRight() {
        const target = this.findTarget();
        const text = target?.text ?? "";
        if (this.offset < text.length) {
            this.offset = this.offset + 1;
        }
        else {
            // 行末で次アイテムへ移動
            this.navigateToItem("right");
        }
        this.applyToStore();
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
        this.insertText("\n");
    }

    onInput(event: InputEvent) {
        const data = event.data;
        if (data) {
            this.insertText(data);
        }
    }

    private navigateToItem(direction: "left" | "right") {
        // 前後アイテムへの移動はストア更新のみ行い、イベント発行はコンポーネントで処理
        store.clearCursorForItem(this.itemId);
        store.setActiveItem(this.itemId);
        store.startCursorBlink();
        // navigation event dispatch should be managed by GlobalTextArea or parent component
    }
}
