import { getLogger } from "../logger";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import type { DisplayItem, OutlinerViewModel } from "../../stores/OutlinerViewModel";
import type { Items } from "../../schema/app-schema";

const logger = getLogger("TreeKeyboard");

export interface TreeKeyboardContext {
    viewModel: OutlinerViewModel;
    items: Items;
    currentUser: string;
    getDisplayItems: () => DisplayItem[];
}

export class TreeKeyboardController {
    constructor(private ctx: TreeKeyboardContext) {}

    handleToggleCollapse(event: CustomEvent) {
        const { itemId } = event.detail;
        this.ctx.viewModel.toggleCollapsed(itemId);
    }

    handleIndent(event: CustomEvent) {
        const itemId: string | undefined = event?.detail?.itemId;
        if (!itemId || itemId === "page-title") return;

        const itemViewModel = this.ctx.viewModel.getViewModel(itemId);
        if (!itemViewModel) return;

        const item = itemViewModel.original as import("../../schema/app-schema").Item;
        const tree = item?.tree;
        const doc = item?.ydoc;
        const key = item?.key;

        if (!tree || !doc || !key || typeof tree.getNodeParentFromKey !== "function") {
            return;
        }

        const parentKey = tree.getNodeParentFromKey(key);
        if (!parentKey) return;

        if (typeof tree.hasNode === "function" && !tree.hasNode(parentKey)) return;
        let siblingKeys: string[];
        try {
            siblingKeys = tree.sortChildrenByOrder(
                tree.getNodeChildrenFromKey(parentKey),
                parentKey,
            );
        } catch (e) {
            return;
        }

        const siblingOrder = [...siblingKeys];
        const currentIndex = siblingOrder.indexOf(key);

        if (currentIndex <= 0) return;

        const targetParentKey = siblingOrder[currentIndex - 1];
        if (!targetParentKey) return;

        const run = () => {
            try {
                tree.moveChildToParent(key, targetParentKey);
                tree.setNodeOrderToEnd(key);
            } catch (error) {
                return;
            }
        };

        if (typeof doc.transact === "function") {
            doc.transact(run, "mobile-indent");
        } else {
            run();
        }

        editorOverlayStore.setActiveItem(itemId);
    }

    handleUnindent(event: CustomEvent) {
        const itemId: string | undefined = event?.detail?.itemId;
        if (!itemId || itemId === "page-title") return;

        const itemViewModel = this.ctx.viewModel.getViewModel(itemId);
        if (!itemViewModel) return;

        const item = itemViewModel.original as import("../../schema/app-schema").Item;
        const tree = item?.tree;
        const doc = item?.ydoc;
        const key = item?.key;

        if (!tree || !doc || !key || typeof tree.getNodeParentFromKey !== "function") {
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

        editorOverlayStore.setActiveItem(itemId);
    }

    focusItemWithPosition(
        itemId: string,
        cursorScreenX?: number,
        shiftKey = false,
        direction?: string,
    ) {
        const item = document.querySelector(`[data-item-id="${itemId}"]`);
        if (!item) return;

        const activeItem = editorOverlayStore.getActiveItem();
        const focusNewItem = () => {
            try {
                const event = new CustomEvent("focus-item", {
                    detail: { cursorScreenX, shiftKey, direction },
                    bubbles: false,
                    cancelable: true,
                });
                item.dispatchEvent(event);
            } catch {}
        };

        if (activeItem && activeItem !== itemId) {
            const activeElement = document.querySelector(`[data-item-id="${activeItem}"]`);
            if (activeElement) {
                activeElement.dispatchEvent(new CustomEvent("finish-edit"));
                setTimeout(focusNewItem, 10);
            } else {
                focusNewItem();
            }
        } else {
            focusNewItem();
        }
    }

    handleNavigateToItem(event: CustomEvent) {
        const { itemId, direction, fromItemId, toItemId, cursorScreenX, shiftKey } = event.detail;
        const displayItems = this.ctx.getDisplayItems();

        if (toItemId) {
            if (direction === "up") {
                this.focusItemWithPosition(toItemId, Number.MAX_SAFE_INTEGER, shiftKey, direction);
            } else if (direction === "down") {
                this.focusItemWithPosition(toItemId, 0, shiftKey, direction);
            } else if (direction === "left" || direction === "right") {
                this.focusItemWithPosition(toItemId, direction === "left" ? Number.MAX_SAFE_INTEGER : 0, shiftKey, direction);
            } else {
                this.focusItemWithPosition(toItemId, 0, shiftKey, undefined);
            }
            return;
        }

        if (direction === "left") {
            const currentIndex = displayItems.findIndex(item => item.model.id === fromItemId);
            if (currentIndex > 0) {
                this.focusItemWithPosition(displayItems[currentIndex - 1].model.id, Number.MAX_SAFE_INTEGER, shiftKey, direction);
            }
            return;
        } else if (direction === "right") {
            const currentIndex = displayItems.findIndex(item => item.model.id === fromItemId);
            if (currentIndex >= 0 && currentIndex < displayItems.length - 1) {
                this.focusItemWithPosition(displayItems[currentIndex + 1].model.id, 0, shiftKey, direction);
            }
            return;
        }

        const currentIndex = displayItems.findIndex(item => item.model.id === fromItemId);

        if (shiftKey && direction === "down") {
            const selections = Object.values(editorOverlayStore.selections);
            if (selections.length > 0) {
                const targetItemId = displayItems[currentIndex + 1]?.model.id;
                if (targetItemId) {
                    const startEl = document.querySelector(`[data-item-id="${targetItemId}"] .item-text`) as HTMLElement;
                    const endLen = startEl?.textContent?.length || 0;
                    editorOverlayStore.setSelection({
                        startItemId: selections[0].startItemId,
                        endItemId: targetItemId,
                        startOffset: selections[0].startOffset,
                        endOffset: endLen,
                        userId: "local",
                        isReversed: false,
                    });
                }
            }
            return;
        }

        if (shiftKey && direction === "up") {
            const selections = Object.values(editorOverlayStore.selections);
            if (selections.length > 0) {
                const targetItemId = displayItems[currentIndex - 1]?.model.id;
                if (targetItemId) {
                    const startEl = document.querySelector(`[data-item-id="${targetItemId}"] .item-text`) as HTMLElement;
                    const startLen = startEl?.textContent?.length || 0;
                    editorOverlayStore.setSelection({
                        startItemId: targetItemId,
                        endItemId: selections[0].endItemId,
                        startOffset: startLen,
                        endOffset: selections[0].endOffset,
                        userId: "local",
                        isReversed: true,
                    });
                }
            }
            return;
        }

        if (currentIndex === 0 && direction === "up") {
            this.focusItemWithPosition(fromItemId, 0, shiftKey, "up");
            return;
        }

        if (direction === "down" && currentIndex === displayItems.length - 1) {
            this.focusItemWithPosition(fromItemId, Number.MAX_SAFE_INTEGER, shiftKey, "down");
            return;
        }

        let targetIndex = -1;
        if (direction === "up") {
            targetIndex = currentIndex - 1;
        } else if (direction === "down") {
            targetIndex = currentIndex + 1;
        }

        if (targetIndex >= 0 && targetIndex < displayItems.length) {
            this.focusItemWithPosition(displayItems[targetIndex].model.id, cursorScreenX, shiftKey, direction);
        }
    }

    handleAddSibling(event: CustomEvent) {
        const { itemId, position } = event.detail;

        if (itemId === "page-title") {
            if (position === "child" || position === "below") {
                this.ctx.items.addNode(this.ctx.currentUser, 0);
            }
            return;
        }

        const displayItems = this.ctx.getDisplayItems();
        const itemIndex = displayItems.findIndex(d => d.model.id === itemId);
        if (itemIndex === -1) return;

        const item = displayItems[itemIndex].model.original;

        if (position === "child") {
            item.items.addNode(this.ctx.currentUser, 0);
        } else {
            const parentItems = item.parent || this.ctx.items;
            const parentArray = parentItems as unknown as import("../../schema/app-schema").Items;

            let selfIndex = -1;
            for (let i = 0; i < parentArray.length; i++) {
                if (parentArray.at(i)?.id === itemId) {
                    selfIndex = i;
                    break;
                }
            }

            if (selfIndex !== -1) {
                if (position === "above") {
                    parentArray.addNode(this.ctx.currentUser, selfIndex);
                } else {
                    parentArray.addNode(this.ctx.currentUser, selfIndex + 1);
                }
            }
        }
    }

    handlePasteMultiItem(event: CustomEvent) {
        const { lines, selections, activeItemId } = event.detail;
        if (selections && Object.keys(selections).length > 0) {
            const firstSelection = Object.values(selections)[0] as any;
            if (firstSelection.startItemId && firstSelection.endItemId && firstSelection.startItemId !== firstSelection.endItemId) {
                this.handleMultiItemSelectionPaste(firstSelection, lines);
                return;
            } else if (firstSelection.startItemId) {
                this.handleSingleItemSelectionPaste(firstSelection, lines);
                return;
            }
        }

        const displayItems = this.ctx.getDisplayItems();
        const itemIndex = displayItems.findIndex((d: DisplayItem) => d.model.id === activeItemId);
        let startIndex = itemIndex;

        if (startIndex === -1 && lines.length > 0) {
            const newItem = this.ctx.items.addNode(this.ctx.currentUser, 0);
            if (newItem) newItem.updateText(lines[0]);
            startIndex = 0;
            for (let i = 1; i < lines.length; i++) {
                const nextItem = this.ctx.items.addNode(this.ctx.currentUser, i);
                if (nextItem) nextItem.updateText(lines[i]);
            }
            return;
        }

        const item = displayItems[startIndex].model.original;
        const currentText = item.text || "";
        const cursorPosition = currentText.length;

        const firstLineRest = currentText.slice(cursorPosition);
        item.updateText(currentText.slice(0, cursorPosition) + lines[0]);

        const parentItems = item.parent || this.ctx.items;
        const parentArray = parentItems as unknown as import("../../schema/app-schema").Items;
        let selfIndex = -1;
        for (let i = 0; i < parentArray.length; i++) {
            if (parentArray.at(i)?.id === activeItemId) {
                selfIndex = i;
                break;
            }
        }

        if (selfIndex !== -1) {
            for (let i = 1; i < lines.length; i++) {
                const isLastLine = i === lines.length - 1;
                const textToInsert = isLastLine ? lines[i] + firstLineRest : lines[i];
                const newItem = parentArray.addNode(this.ctx.currentUser, selfIndex + i);
                if (newItem) newItem.updateText(textToInsert);
            }
        }
    }

    handleMultiItemSelectionPaste(selection: { startItemId: string, endItemId: string, startOffset?: number, endOffset?: number }, lines: string[]) {
        const displayItems = this.ctx.getDisplayItems();
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;

        const startIndex = displayItems.findIndex((d) => d.model.id === startItemId);
        const endIndex = displayItems.findIndex((d) => d.model.id === endItemId);

        if (startIndex < 0 || endIndex < 0) return;

        const actualStartIndex = Math.min(startIndex, endIndex);
        const actualEndIndex = Math.max(startIndex, endIndex);

        for (let i = actualEndIndex; i >= actualStartIndex; i--) {
            if (i === actualStartIndex) {
                const startItem = displayItems[i].model.original;
                startItem.updateText(lines[0] || "");

                if (lines.length > 1) {
                    const parentItems = startItem.parent || this.ctx.items;
                    const siblings = parentItems as unknown as import("../../schema/app-schema").Items;
                    let selfIndex = -1;
                    for (let j = 0; j < siblings.length; j++) {
                        if (siblings.at(j)?.id === startItemId) {
                            selfIndex = j;
                            break;
                        }
                    }
                    if (selfIndex !== -1) {
                        for (let j = 1; j < lines.length; j++) {
                            const newItem = siblings.addNode(this.ctx.currentUser, selfIndex + j);
                            if (newItem) newItem.updateText(lines[j]);
                        }
                    }
                }
            } else {
                const itemToDelete = displayItems[i].model.original;
                const p = itemToDelete.parent || this.ctx.items;
                p.removeAt(p.indexOf(itemToDelete));
            }
        }

        const newCursorItemId = displayItems[actualStartIndex]?.model.id;
        if (newCursorItemId) {
            editorOverlayStore.setCursor({
                itemId: newCursorItemId,
                offset: (lines[lines.length - 1] || "").length,
                isActive: true,
                userId: "local",
            });
            editorOverlayStore.setActiveItem(newCursorItemId);
            editorOverlayStore.clearSelections();
        }
    }

    handleSingleItemSelectionPaste(selection: { startItemId: string, startOffset: number, endOffset: number }, lines: string[]) {
        const displayItems = this.ctx.getDisplayItems();
        const itemId = selection.startItemId;
        const startOffset = Math.min(selection.startOffset, selection.endOffset);
        const endOffset = Math.max(selection.startOffset, selection.endOffset);

        const itemIndex = displayItems.findIndex((d) => d.model.id === itemId);
        if (itemIndex < 0) return;

        const item = displayItems[itemIndex].model.original;
        const text: string = (item.text as { toString?: () => string })?.toString?.() ?? "";

        const beforeText = text.substring(0, startOffset);
        const afterText = text.substring(endOffset);

        if (lines.length === 1) {
            item.updateText(beforeText + lines[0] + afterText);
            editorOverlayStore.setCursor({
                itemId,
                offset: startOffset + lines[0].length,
                isActive: true,
                userId: "local",
            });
            editorOverlayStore.setActiveItem(itemId);
            editorOverlayStore.clearSelections();
        } else {
            item.updateText(beforeText + lines[0]);
            const parentItems = item.parent || this.ctx.items;
            const siblings = parentItems as unknown as import("../../schema/app-schema").Items;
            let selfIndex = -1;
            for (let j = 0; j < siblings.length; j++) {
                if (siblings.at(j)?.id === itemId) {
                    selfIndex = j;
                    break;
                }
            }
            if (selfIndex !== -1) {
                for (let i = 1; i < lines.length; i++) {
                    const isLastLine = i === lines.length - 1;
                    const textToInsert = isLastLine ? lines[i] + afterText : lines[i];
                    const newItem = siblings.addNode(this.ctx.currentUser, selfIndex + i);
                    if (newItem) newItem.updateText(textToInsert);
                }
            }

            const lastItemIndex = itemIndex + lines.length - 1;
            const lastItemId = displayItems[lastItemIndex]?.model.id;
            if (lastItemId) {
                const lastLine = lines[lines.length - 1];
                const newOffset = lastLine.length;
                editorOverlayStore.setCursor({
                    itemId: lastItemId,
                    offset: newOffset,
                    isActive: true,
                    userId: "local",
                });
                editorOverlayStore.setActiveItem(lastItemId);
                editorOverlayStore.clearSelections();
            }
        }
    }
}
