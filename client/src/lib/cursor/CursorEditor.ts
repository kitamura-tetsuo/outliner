// @ts-nocheck
import type { Item } from "../../schema/yjs-schema";
import { Items } from "../../schema/yjs-schema";
import type { SelectionRange } from "../../stores/EditorOverlayStore.svelte";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import { ScrapboxFormatter } from "../../utils/ScrapboxFormatter";
import { findNextItem, findPreviousItem, isPageItem, searchItem } from "./CursorNavigationUtils";
import {
    getSelectionForUser,
    getSingleItemSelectionForUser,
    normalizeSelectionOffsets,
    selectionHasRange,
    selectionSpansMultipleItems,
    type SingleItemSelection,
} from "./CursorSelectionUtils";

export interface CursorEditingContext {
    itemId: string;
    offset: number;
    userId: string;
    isActive: boolean;
    clearSelection(): void;
    applyToStore(): void;
    findTarget(): Item | undefined;
}

export class CursorEditor {
    constructor(private readonly cursor: CursorEditingContext) {}

    private getSelection(): SelectionRange | undefined {
        return getSelectionForUser(this.cursor.userId);
    }

    private getSingleItemSelection(itemId?: string): SingleItemSelection | undefined {
        return getSingleItemSelectionForUser(this.cursor.userId, itemId);
    }

    insertText(ch: string) {
        const cursor = this.cursor;
        const node = cursor.findTarget();
        if (!node) {
            console.error(`insertText: Target item not found for itemId: ${cursor.itemId}`);
            return;
        }

        const currentText = node.text?.toString?.() ?? "";
        const selection = this.getSingleItemSelection(cursor.itemId);

        if (selection && selection.startOffset !== selection.endOffset) {
            const { startOffset, endOffset } = selection;
            const txt = currentText.slice(0, startOffset) + ch + currentText.slice(endOffset);
            node.updateText(txt);

            cursor.offset = startOffset + ch.length;
            cursor.clearSelection();
        } else {
            const txt = currentText.slice(0, cursor.offset) + ch + currentText.slice(cursor.offset);
            node.updateText(txt);
            cursor.offset += ch.length;
        }

        cursor.applyToStore();
        store.triggerOnEdit();
    }

    deleteBackward() {
        const cursor = this.cursor;
        const node = cursor.findTarget();
        if (!node) return;

        const selection = this.getSelection();

        if (selection && selectionHasRange(selection)) {
            if (selectionSpansMultipleItems(selection)) {
                this.deleteMultiItemSelection(selection);
                return;
            }

            const single = this.getSingleItemSelection(cursor.itemId);
            if (single) {
                const { startOffset, endOffset } = single;
                let txt = node.text;
                txt = txt.slice(0, startOffset) + txt.slice(endOffset);
                node.updateText(txt);

                cursor.offset = startOffset;
                cursor.clearSelection();
            }
        } else {
            if (cursor.offset > 0) {
                let txt = node.text;
                const pos = cursor.offset - 1;
                txt = txt.slice(0, pos) + txt.slice(pos + 1);
                node.updateText(txt);
                cursor.offset = Math.max(0, cursor.offset - 1);
            } else {
                this.mergeWithPreviousItem();
            }
        }

        cursor.applyToStore();
        store.triggerOnEdit();
    }

    deleteForward() {
        const cursor = this.cursor;
        const node = cursor.findTarget();
        if (!node) return;

        const selection = this.getSelection();

        if (selection && selectionHasRange(selection)) {
            if (selectionSpansMultipleItems(selection)) {
                this.deleteMultiItemSelection(selection);
                return;
            }

            const single = this.getSingleItemSelection(cursor.itemId);
            if (single) {
                const { startOffset, endOffset } = single;
                let txt = node.text;
                txt = txt.slice(0, startOffset) + txt.slice(endOffset);
                node.updateText(txt);

                cursor.offset = startOffset;
                cursor.clearSelection();
            }
        } else {
            let txt = node.text;
            if (cursor.offset < txt.length) {
                txt = txt.slice(0, cursor.offset) + txt.slice(cursor.offset + 1);
                node.updateText(txt);
            } else {
                if (txt.length === 0) {
                    this.deleteEmptyItem();
                    return;
                }
                this.mergeWithNextItem();
            }
        }

        cursor.applyToStore();
        store.triggerOnEdit();

        const textarea = store.getTextareaRef();
        if (textarea) {
            textarea.value = node.text;
            textarea.setSelectionRange(cursor.offset, cursor.offset);
        }
    }

    insertLineBreak() {
        const cursor = this.cursor;
        const target = cursor.findTarget();
        if (!target) return;

        const text: string = (target.text as any)?.toString?.() ?? "";
        const beforeText = text.slice(0, cursor.offset);
        const afterText = text.slice(cursor.offset);
        const pageTitle = isPageItem(target);

        if (pageTitle) {
            if (target.items && target.items instanceof Items) {
                target.updateText(beforeText);
                const newItem = target.items.addNode(cursor.userId, 0);
                newItem.updateText(afterText);

                const oldItemId = cursor.itemId;
                const clearCursorAndSelection = (store as any).clearCursorAndSelection;
                if (typeof clearCursorAndSelection === "function") {
                    clearCursorAndSelection(cursor.userId);
                } else {
                    store.clearSelectionForUser?.(cursor.userId);
                    store.clearCursorForItem?.(oldItemId);
                }

                cursor.itemId = newItem.id;
                cursor.offset = 0;

                store.setActiveItem(cursor.itemId);
                store.startCursorBlink();

                if (typeof document !== "undefined") {
                    const event = new CustomEvent("navigate-to-item", {
                        bubbles: true,
                        detail: { direction: "enter", fromItemId: target.id, toItemId: cursor.itemId },
                    });
                    document.dispatchEvent(event);
                }

                cursor.applyToStore();
                return;
            }
        } else {
            const parent = target.parent as any;
            if (parent) {
                const itemsCollection = typeof parent.indexOf === "function"
                    ? parent
                    : parent?.items;
                const addNode = typeof parent.addNode === "function"
                    ? parent.addNode.bind(parent)
                    : typeof itemsCollection?.addNode === "function"
                    ? itemsCollection.addNode.bind(itemsCollection)
                    : undefined;

                if (itemsCollection && typeof itemsCollection.indexOf === "function" && addNode) {
                    const currentIndex = itemsCollection.indexOf(target);
                    target.updateText(beforeText);
                    const newItem = addNode(cursor.userId, currentIndex + 1);
                    if (!newItem) return;
                    newItem.updateText(afterText);

                    const oldItemId = cursor.itemId;
                    const clearCursorAndSelection = (store as any).clearCursorAndSelection;
                    if (typeof clearCursorAndSelection === "function") {
                        clearCursorAndSelection(cursor.userId);
                    } else {
                        store.clearSelectionForUser?.(cursor.userId);
                        store.clearCursorForItem?.(oldItemId);
                    }

                    cursor.itemId = newItem.id;
                    cursor.offset = 0;

                    store.setActiveItem(cursor.itemId);
                    store.startCursorBlink();

                    if (typeof document !== "undefined") {
                        const event = new CustomEvent("navigate-to-item", {
                            bubbles: true,
                            detail: { direction: "enter", fromItemId: target.id, toItemId: cursor.itemId },
                        });
                        document.dispatchEvent(event);
                    }

                    cursor.applyToStore();
                    return;
                }
            }
        }

        this.insertText("\n");
    }

    onInput(event: InputEvent) {
        const data = event.data;
        if (data && data.length > 0) {
            this.insertText(data);
        }
    }

    copySelectedText() {
        const cursor = this.cursor;
        const selection = this.getSingleItemSelection(cursor.itemId);
        if (!selection) return;
        if (selection.startOffset === selection.endOffset) return;

        const target = cursor.findTarget();
        if (!target) return;

        const text = target.text || "";
        const selectedText = text.substring(selection.startOffset, selection.endOffset);
        void selectedText;
        return;
    }

    cutSelectedText() {
        const cursor = this.cursor;
        const selection = this.getSelection();
        if (!selection) return;

        if (selectionSpansMultipleItems(selection)) {
            this.deleteMultiItemSelection(selection);
            return;
        }

        const single = this.getSingleItemSelection(cursor.itemId);
        if (!single || single.startOffset === single.endOffset) return;

        const target = cursor.findTarget();
        if (!target) return;

        const text = target.text || "";
        const newText = text.substring(0, single.startOffset) + text.substring(single.endOffset);
        target.updateText(newText);

        cursor.offset = single.startOffset;
        cursor.applyToStore();

        cursor.clearSelection();
        store.startCursorBlink();
    }

    deleteSelection() {
        const cursor = this.cursor;
        const selection = this.getSelection();
        if (!selection) return;

        if (selectionSpansMultipleItems(selection)) {
            this.deleteMultiItemSelection(selection);
            return;
        }

        const target = cursor.findTarget();
        if (!target) return;

        const single = this.getSingleItemSelection(cursor.itemId);
        if (!single) return;

        const text = target.text || "";
        const newText = text.substring(0, single.startOffset) + text.substring(single.endOffset);
        target.updateText(newText);

        cursor.offset = single.startOffset;
        cursor.applyToStore();

        cursor.clearSelection();
        store.startCursorBlink();
    }

    formatBold() {
        this.applyScrapboxFormatting("bold");
    }

    formatItalic() {
        this.applyScrapboxFormatting("italic");
    }

    formatUnderline() {
        this.applyScrapboxFormatting("underline");
    }

    formatStrikethrough() {
        this.applyScrapboxFormatting("strikethrough");
    }

    formatCode() {
        this.applyScrapboxFormatting("code");
    }

    private mergeWithPreviousItem() {
        const cursor = this.cursor;
        const currentItem = cursor.findTarget();
        if (!currentItem) return;

        const prevItem = findPreviousItem(cursor.itemId);
        if (!prevItem) return;

        const prevText = prevItem.text || "";
        const currentText = currentItem.text || "";
        prevItem.updateText(prevText + currentText);

        currentItem.delete();

        const oldItemId = cursor.itemId;
        cursor.itemId = prevItem.id;
        cursor.offset = prevText.length;

        store.clearCursorForItem(oldItemId);
        store.setActiveItem(cursor.itemId);
        store.startCursorBlink();
    }

    private mergeWithNextItem() {
        const cursor = this.cursor;
        const currentItem = cursor.findTarget();
        if (!currentItem) return;

        const nextItem = findNextItem(cursor.itemId);
        if (!nextItem) return;

        const currentText = currentItem.text || "";
        const nextText = nextItem.text || "";
        currentItem.updateText(currentText + nextText);

        nextItem.delete();
    }

    private deleteEmptyItem() {
        const cursor = this.cursor;
        const currentItem = cursor.findTarget();
        if (!currentItem) return;

        if (currentItem.text && currentItem.text.length > 0) return;

        const nextItem = findNextItem(cursor.itemId);

        let targetItemId: string;
        let targetOffset: number;

        if (nextItem) {
            targetItemId = nextItem.id;
            targetOffset = 0;
        } else {
            const prevItem = findPreviousItem(cursor.itemId);
            if (prevItem) {
                targetItemId = prevItem.id;
                targetOffset = prevItem.text ? prevItem.text.length : 0;
            } else {
                return;
            }
        }

        store.clearCursorForItem(cursor.itemId);
        currentItem.delete();

        cursor.itemId = targetItemId;
        cursor.offset = targetOffset;

        store.setActiveItem(cursor.itemId);
        store.setCursor({
            itemId: cursor.itemId,
            offset: cursor.offset,
            isActive: true,
            userId: cursor.userId,
        });

        store.startCursorBlink();
    }

    deleteMultiItemSelection(selection: SelectionRange) {
        const cursor = this.cursor;
        if (!selection) return;

        if (!selectionSpansMultipleItems(selection)) {
            this.deleteSelection();
            return;
        }

        const root = generalStore.currentPage;
        if (!root) return;

        const startItem = searchItem(root, selection.startItemId);
        const endItem = searchItem(root, selection.endItemId);
        if (!startItem || !endItem) return;

        const isReversed = !!selection.isReversed;
        const firstItem = isReversed ? endItem : startItem;
        const lastItem = isReversed ? startItem : endItem;
        const firstOffset = isReversed ? selection.endOffset : selection.startOffset;
        const lastOffset = isReversed ? selection.startOffset : selection.endOffset;

        const parent = firstItem.parent;
        if (!parent || parent !== lastItem.parent) return;

        const items = parent as Items;
        const firstIndex = items.indexOf(firstItem);
        const lastIndex = items.indexOf(lastItem);
        if (firstIndex === -1 || lastIndex === -1) return;

        try {
            const firstText = firstItem.text || "";
            const newFirstText = firstText.substring(0, firstOffset);
            const lastText = lastItem.text || "";
            const newLastText = lastText.substring(lastOffset);

            const itemsToRemove: string[] = [];
            for (let i = firstIndex + 1; i <= lastIndex; i++) {
                const item = items.at(i);
                if (item) itemsToRemove.push(item.id);
            }

            for (const itemId of itemsToRemove) {
                store.clearCursorForItem(itemId);
            }

            firstItem.updateText(newFirstText + newLastText);

            for (let i = lastIndex; i > firstIndex; i--) {
                items.removeAt(i);
            }

            cursor.itemId = firstItem.id;
            cursor.offset = firstOffset;
            cursor.applyToStore();

            cursor.clearSelection();
            store.setActiveItem(cursor.itemId);
            store.startCursorBlink();

            if (typeof window !== "undefined") {
                setTimeout(() => {
                    const cursorVisible = document.querySelector(".editor-overlay .cursor") !== null;
                    if (!cursorVisible) {
                        cursor.applyToStore();
                        store.startCursorBlink();
                    }
                }, 150);
            }
        } catch {
            cursor.clearSelection();
            store.startCursorBlink();
            cursor.applyToStore();
        }
    }

    private applyScrapboxFormatting(formatType: "bold" | "italic" | "strikethrough" | "underline" | "code") {
        const cursor = this.cursor;
        const selection = this.getSelection();

        if (!selection || !selectionHasRange(selection)) {
            return;
        }

        if (selectionSpansMultipleItems(selection)) {
            this.applyScrapboxFormattingToMultipleItems(selection, formatType);
            return;
        }

        const target = cursor.findTarget();
        if (!target) return;

        const single = this.getSingleItemSelection(cursor.itemId);
        if (!single) return;

        const text = target.text || "";
        const selectedText = text.substring(single.startOffset, single.endOffset);

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

        const newText = text.substring(0, single.startOffset) + formattedText + text.substring(single.endOffset);
        target.updateText(newText);

        cursor.offset = single.startOffset + formattedText.length;
        cursor.applyToStore();

        cursor.clearSelection();
        store.startCursorBlink();
    }

    private applyScrapboxFormattingToMultipleItems(
        selection: SelectionRange,
        formatType: "bold" | "italic" | "strikethrough" | "underline" | "code",
    ) {
        const cursor = this.cursor;
        const { startItemId, endItemId, startOffset, endOffset } = selection;
        const isReversed = !!selection.isReversed;

        const allItemElements = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
        const allItemIds = allItemElements
            .map(el => el.getAttribute("data-item-id"))
            .filter((value): value is string => !!value);

        const startIdx = allItemIds.indexOf(startItemId);
        const endIdx = allItemIds.indexOf(endItemId);
        if (startIdx === -1 || endIdx === -1) return;

        const firstIdx = Math.min(startIdx, endIdx);
        const lastIdx = Math.max(startIdx, endIdx);

        for (let i = firstIdx; i <= lastIdx; i++) {
            const itemId = allItemIds[i];
            const item = searchItem(generalStore.currentPage!, itemId);
            if (!item) continue;

            const text = item.text || "";

            if (i === firstIdx && i === lastIdx) {
                const start = isReversed ? endOffset : startOffset;
                const end = isReversed ? startOffset : endOffset;
                const selectedText = text.substring(start, end);

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
                // 複数アイテムにまたがる選択範囲の詳細なフォーマットは未対応
            }
        }

        cursor.itemId = isReversed ? startItemId : endItemId;
        cursor.offset = isReversed ? startOffset : endOffset;
        cursor.applyToStore();

        cursor.clearSelection();
        store.startCursorBlink();
    }
}
