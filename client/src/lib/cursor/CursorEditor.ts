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
    // Cursor movement methods
    moveLeft(): void;
    moveRight(): void;
    moveUp(): void;
    moveDown(): void;
    // Text position utility methods
    getCurrentColumn(text: string, offset: number): number;
    getCurrentLineIndex(text: string, offset: number): number;
    getLineStartOffset(text: string, lineIndex: number): number;
    getLineEndOffset(text: string, lineIndex: number): number;
    getVisualLineInfo(
        itemId: string,
        offset: number,
    ): { lineIndex: number; lineStartOffset: number; totalLines: number; } | null;
    getVisualLineOffsetRange(itemId: string, lineIndex: number): { startOffset: number; endOffset: number; } | null;
    // Navigation utility methods
    findNextItem(): Item | undefined;
    findPreviousItem(): Item | undefined;
    // Selection utility method
    updateGlobalTextareaSelection(startItemId: string, startOffset: number, endItemId: string, endOffset: number): void;
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

        // Ensure the global textarea is in sync with the Yjs document state
        const textarea = store.getTextareaRef();
        if (textarea) {
            textarea.value = node.text?.toString?.() ?? "";
            textarea.setSelectionRange(cursor.offset, cursor.offset);
        }
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
                let txt = node.text?.toString?.() ?? "";
                txt = txt.slice(0, startOffset) + txt.slice(endOffset);
                node.updateText(txt);

                cursor.offset = startOffset;
                cursor.clearSelection();
            }
        } else {
            if (cursor.offset > 0) {
                let txt = node.text?.toString?.() ?? "";
                const pos = cursor.offset - 1;
                txt = txt.slice(0, pos) + txt.slice(pos + 1);
                node.updateText(txt);
                cursor.offset = Math.max(0, cursor.offset - 1);
            } else {
                this.mergeWithPreviousItem();
                return; // Early return after merge since it handles its own state updates
            }
        }

        // Ensure the global textarea is in sync with the Yjs document state
        // before applying the cursor position and triggering edit
        const textarea = store.getTextareaRef();
        if (textarea) {
            textarea.value = node.text?.toString?.() ?? "";
            textarea.setSelectionRange(cursor.offset, cursor.offset);
        }

        cursor.applyToStore();

        // Trigger edit to ensure UI updates properly
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
                let txt = node.text?.toString?.() ?? "";
                txt = txt.slice(0, startOffset) + txt.slice(endOffset);
                node.updateText(txt);

                cursor.offset = startOffset;
                cursor.clearSelection();
            }
        } else {
            let txt = node.text?.toString?.() ?? "";
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
            textarea.value = node.text?.toString?.() ?? "";
            textarea.setSelectionRange(cursor.offset, cursor.offset);
        }
    }

    insertLineBreak() {
        const cursor = this.cursor;
        const target = cursor.findTarget();
        if (!target) return;

        const text: string = (target.text as unknown as { toString?: () => string; })?.toString?.() ?? "";
        const beforeText = text.slice(0, cursor.offset);
        const afterText = text.slice(cursor.offset);
        const pageTitle = isPageItem(target);

        if (pageTitle) {
            if (target.items && target.items instanceof Items) {
                target.updateText(beforeText);
                const newItem = target.items.addNode(cursor.userId, 0);
                newItem.updateText(afterText);

                const oldItemId = cursor.itemId;
                const clearCursorAndSelection =
                    (store as unknown as { clearCursorAndSelection?: (userId: string) => void; })
                        .clearCursorAndSelection;
                if (typeof clearCursorAndSelection === "function") {
                    if (typeof clearCursorAndSelection.call === "function") {
                        clearCursorAndSelection.call(store, cursor.userId);
                    } else {
                        clearCursorAndSelection(cursor.userId);
                    }
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
            const parent = target.parent as Item | undefined;
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
                    const clearCursorAndSelection =
                        (store as unknown as { clearCursorAndSelection?: (userId: string) => void; })
                            .clearCursorAndSelection;
                    if (typeof clearCursorAndSelection === "function") {
                        if (typeof clearCursorAndSelection.call === "function") {
                            clearCursorAndSelection.call(store, cursor.userId);
                        } else {
                            clearCursorAndSelection(cursor.userId);
                        }
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

        const text = (target.text && typeof target.text.toString === "function") ? target.text.toString() : "";
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

        const text = (target.text && typeof target.text.toString === "function") ? target.text.toString() : "";
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

        const text = (target.text && typeof target.text.toString === "function") ? target.text.toString() : "";
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

    protected mergeWithPreviousItem() {
        const cursor = this.cursor;
        const currentItem = cursor.findTarget();
        if (!currentItem) return;

        const prevItem = findPreviousItem(cursor.itemId);
        if (!prevItem) return;

        const prevText = this.getPlainText(prevItem);
        const currentText = this.getPlainText(currentItem);
        const combinedText = `${prevText}${currentText}`;

        const oldItemId = cursor.itemId;
        const prevId = prevItem?.id ?? cursor.itemId;
        const newOffset = prevText.length;

        this.runInTransaction([prevItem, currentItem], () => {
            this.updateItemText(prevItem, combinedText);
            this.deleteItemNode(currentItem);
        });

        cursor.itemId = prevId;
        cursor.offset = newOffset;

        cursor.applyToStore();
        store.clearCursorForItem(oldItemId);
        store.setActiveItem(cursor.itemId);
        store.startCursorBlink();
    }

    private getPlainText(item: Item | undefined): string {
        if (!item) return "";
        const textValue = (item as unknown as { text?: unknown; }).text;
        if (typeof textValue === "string") return textValue;
        if (textValue && typeof textValue.toString === "function") {
            try {
                return textValue.toString();
            } catch {}
        }
        if (typeof (item as unknown as { getText?: () => string; }).getText === "function") {
            try {
                const result = (item as unknown as { getText?: () => string; }).getText?.();
                if (typeof result === "string") return result;
            } catch {}
        }
        return "";
    }

    private updateItemText(item: Item | undefined, text: string) {
        if (!item) return;
        if (typeof item.updateText === "function") {
            item.updateText(text);
            return;
        }

        const tree = (item as unknown as { tree?: unknown; }).tree;
        const key = (item as unknown as { key?: string; }).key ?? (item as unknown as { id?: string; }).id;
        if (
            !tree || !key
            || typeof (tree as { getNodeValueFromKey?: (key: string) => unknown; }).getNodeValueFromKey !== "function"
        ) return;

        const value = (tree as { getNodeValueFromKey: (key: string) => unknown; }).getNodeValueFromKey(key);
        const yText = (value as { get?: (key: string) => unknown; })?.get?.("text");
        try {
            if (
                yText
                && typeof (yText as { delete?: (n: number) => void; insert?: (n: number, s: string) => void; }).delete
                    === "function"
                && typeof yText.insert === "function"
            ) {
                (yText as { delete: (n: number) => void; insert: (n: number, s: string) => void; }).delete(
                    0,
                    (yText as { length?: number; }).length ?? 0,
                );
                if (text) (yText as { insert: (n: number, s: string) => void; }).insert(0, text);
            } else if (value && typeof (value as { set?: (k: string, v: unknown) => void; }).set === "function") {
                (value as { set: (k: string, v: unknown) => void; }).set("text", text);
            }
            if (value && typeof (value as { set?: (k: string, v: unknown) => void; }).set === "function") {
                (value as { set: (k: string, v: unknown) => void; }).set("lastChanged", Date.now());
            }
        } catch {}
    }

    private deleteItemNode(item: Item | undefined) {
        if (!item) return;
        if (typeof item.delete === "function") {
            item.delete();
            return;
        }

        const key = (item as unknown as { key?: string; }).key ?? (item as unknown as { id?: string; }).id;
        if (!key) return;

        const treeCandidates = [
            (item as unknown as { tree?: unknown; }).tree,
            (item as unknown as { parent?: { tree?: unknown; }; })?.parent?.tree,
            (generalStore as unknown as { project?: { tree?: unknown; }; })?.project?.tree,
        ];

        for (const tree of treeCandidates) {
            if (tree && typeof tree.deleteNodeAndDescendants === "function") {
                try {
                    tree.deleteNodeAndDescendants(key);
                    return;
                } catch {}
            }
        }
    }

    private runInTransaction(participants: (Item | undefined)[], action: () => void) {
        const doc = participants
            .map(item => (item as unknown as { ydoc?: { transact: (fn: () => void) => void; }; })?.ydoc)
            .find(candidate => candidate && typeof candidate.transact === "function");

        if (doc) {
            try {
                doc.transact(action);
                return;
            } catch {}
        }

        action();
    }

    protected mergeWithNextItem() {
        const cursor = this.cursor;
        const currentItem = cursor.findTarget();
        if (!currentItem) return;

        const nextItem = findNextItem(cursor.itemId);
        if (!nextItem) return;

        const currentText = currentItem.text ? currentItem.text.toString() : "";
        const nextText = nextItem.text ? nextItem.text.toString() : "";
        currentItem.updateText(currentText + nextText);

        (nextItem as any).delete();
    }

    protected deleteEmptyItem() {
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
        (currentItem as any).delete();

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

        // Type mismatch between app-schema and yjs-schema Item
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const startItem = searchItem(root, selection.startItemId);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const endItem = searchItem(root, selection.endItemId);
        if (!startItem || !endItem) return;

        const isReversed = !!selection.isReversed;
        const firstItem = isReversed ? endItem : startItem;
        const lastItem = isReversed ? startItem : endItem;
        const firstOffset = isReversed ? selection.endOffset : selection.startOffset;
        const lastOffset = isReversed ? selection.startOffset : selection.endOffset;

        const parent = firstItem.parent as Items;
        if (!parent || parent !== lastItem.parent) return;

        const items = parent;
        const firstIndex = items.indexOf(firstItem as any);
        const lastIndex = items.indexOf(lastItem as any);
        if (firstIndex === -1 || lastIndex === -1) return;

        try {
            const firstText = firstItem.text ? firstItem.text.toString() : "";
            const newFirstText = firstText.substring(0, firstOffset);
            const lastText = lastItem.text ? lastItem.text.toString() : "";
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
                (items as any).removeAt(i);
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

        const { startOffset, endOffset } = normalizeSelectionOffsets(selection);

        const text = (target.text && typeof target.text.toString === "function") ? target.text.toString() : "";
        const selectedText = text.substring(startOffset, endOffset);

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

        const newText = text.substring(0, startOffset) + formattedText + text.substring(endOffset);
        target.updateText(newText);

        // For underline, ensure the cursor position is correctly set
        // This addresses a potential issue where the cursor position calculation
        // might not work correctly with underline tags
        cursor.offset = startOffset + formattedText.length;
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
            // Type mismatch between app-schema and yjs-schema Item
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const item = searchItem(generalStore.currentPage!, itemId);
            if (!item) continue;

            const text = item.text ? item.text.toString() : "";

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
