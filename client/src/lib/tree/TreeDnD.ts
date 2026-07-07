import { getLogger } from "../logger";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import type { DisplayItem } from "../../stores/OutlinerViewModel";
import type { Items } from "../../schema/app-schema";
import { processAndUploadAttachment, addAttachmentSafely } from "../../services/attachmentUpload";
import { getDefaultContainerId } from "../../stores/firestoreStore.svelte";

const logger = getLogger("TreeDnD");

export interface TreeDnDContext {
    isDragging: boolean;
    dragStartItemId: string | null;
    dragStartOffset: number;
    dragCurrentItemId: string | null;
    dragCurrentOffset: number;
    currentUser: string;
    items: Items;
    triggerUpdate: () => void;
    getDisplayItems: () => DisplayItem[];
    pageItem?: import("../../schema/app-schema").Item;
}

export class TreeDnDController {
    constructor(private ctx: TreeDnDContext) {}

    handleTreeMouseUp() {
        if (!this.ctx.isDragging) return;
        this.ctx.isDragging = false;
        this.ctx.dragStartItemId = null;
        this.ctx.dragCurrentItemId = null;
    }

    handleItemDragStart(event: CustomEvent) {
        const { itemId, offset } = event.detail;
        this.ctx.isDragging = true;
        this.ctx.dragStartItemId = itemId;
        this.ctx.dragStartOffset = offset ?? 0;
        this.ctx.dragCurrentItemId = itemId;
        this.ctx.dragCurrentOffset = offset ?? 0;
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Drag start: itemId=${itemId}, offset=${offset}`);
        }
    }

    handleItemDrag(event: CustomEvent) {
        const { itemId, offset } = event.detail;
        if (!this.ctx.isDragging || !this.ctx.dragStartItemId) return;

        this.ctx.dragCurrentItemId = itemId;
        this.ctx.dragCurrentOffset = offset;
        this.updateDragSelection();

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Dragging: itemId=${itemId}, offset=${offset}`);
        }
    }

    private updateDragSelection() {
        const { dragStartItemId, dragCurrentItemId, dragStartOffset, dragCurrentOffset, getDisplayItems } = this.ctx;
        if (!dragStartItemId || !dragCurrentItemId) return;
        const displayItems = getDisplayItems();

        const startIndex = displayItems.findIndex(item => item.model.id === dragStartItemId);
        const currentIndex = displayItems.findIndex(item => item.model.id === dragCurrentItemId);

        if (startIndex === -1 || currentIndex === -1) return;

        const isReversed = startIndex > currentIndex || (startIndex === currentIndex && dragStartOffset > dragCurrentOffset);
        const startItemId = isReversed ? dragCurrentItemId : dragStartItemId;
        const startOffset = isReversed ? dragCurrentOffset : dragStartOffset;
        const endItemId = isReversed ? dragStartItemId : dragCurrentItemId;
        const endOffset = isReversed ? dragStartOffset : dragCurrentOffset;

        editorOverlayStore.clearSelectionForUser("local");
        editorOverlayStore.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: "local",
            isReversed,
        });

        editorOverlayStore.setCursor({
            itemId: dragCurrentItemId,
            offset: dragCurrentOffset,
            isActive: true,
            userId: "local",
        });

        editorOverlayStore.setActiveItem(dragCurrentItemId);
    }

    handleItemDrop(event: CustomEvent) {
        const { targetItemId, position, text, selection, sourceItemId, attachmentUrl } = event.detail;

        try {
            const w = typeof window !== "undefined" ? window : null;
            if (w && Array.isArray((w as any).E2E_LOGS)) {
                (w as any).E2E_LOGS.push({
                    tag: "handleItemDrop",
                    targetItemId,
                    position,
                    sourceItemId,
                    selection: selection ? "yes" : "no",
                    t: Date.now(),
                });
            }
        } catch {}

        if (selection) {
            const startItemId = selection.startItemId;
            const endItemId = selection.endItemId;
            if (startItemId === endItemId) {
                this.handleSingleItemSelectionDrop(selection, targetItemId, position, text);
            } else {
                this.handleMultiItemSelectionDrop(selection, targetItemId, position, text);
            }
        } else if (sourceItemId) {
            this.handleItemMoveDrop(sourceItemId, targetItemId, position);
        } else if (attachmentUrl) {
            this.handleExternalAttachmentDrop(targetItemId, position, attachmentUrl);
        } else {
            this.handleExternalTextDrop(targetItemId, position, text);
        }

        this.ctx.isDragging = false;
        this.ctx.dragStartItemId = null;
        this.ctx.dragCurrentItemId = null;
    }

    handleItemDragEnd(event: CustomEvent) {
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Drag end: itemId=${event.detail.itemId}`);
        }
        this.ctx.isDragging = false;
        this.ctx.dragStartItemId = null;
        this.ctx.dragCurrentItemId = null;
    }

    private handleSingleItemSelectionDrop(
        selection: { startItemId: string; startOffset: number; endOffset: number },
        targetItemId: string,
        position: string,
        text: string
    ) {
        const { startItemId, startOffset, endOffset } = selection;
        const displayItems = this.ctx.getDisplayItems();
        const sourceItem = displayItems.find(item => item.model.id === startItemId)?.model.original;
        const targetItemIndex = displayItems.findIndex(item => item.model.id === targetItemId);

        if (!sourceItem || targetItemIndex === -1) return;

        const targetItem = displayItems[targetItemIndex].model.original;

        let targetId = targetItemId;
        if (position === "middle") {
            const newText = text;
            targetItem.updateText((targetItem.text ?? "") + newText);
        } else {
            const parentItems = targetItem.parent || this.ctx.items;
            const siblings = parentItems as unknown as import("../../schema/app-schema").Items;
            let targetOrderIndex = -1;

            for (let i = 0; i < siblings.length; i++) {
                if (siblings.at(i)?.id === targetItemId) {
                    targetOrderIndex = i;
                    break;
                }
            }

            if (targetOrderIndex !== -1) {
                const insertIndex = position === "above" ? targetOrderIndex : targetOrderIndex + 1;
                const newItem = siblings.addNode(this.ctx.currentUser, insertIndex);
                if (newItem) {
                    newItem.updateText(text);
                    targetId = newItem.id;
                }
            }
        }

        const sourceText = sourceItem.text || "";
        const minOffset = Math.min(startOffset, endOffset);
        const maxOffset = Math.max(startOffset, endOffset);
        const newSourceText = sourceText.slice(0, minOffset) + sourceText.slice(maxOffset);
        sourceItem.updateText(newSourceText);

        this.ctx.triggerUpdate();
        editorOverlayStore.setCursor({
            itemId: targetId,
            offset: text.length,
            isActive: true,
            userId: "local",
        });
        editorOverlayStore.setActiveItem(targetId);
        editorOverlayStore.clearSelections();
    }

    private handleMultiItemSelectionDrop(
        selection: { startItemId: string; endItemId: string; startOffset?: number; endOffset?: number },
        targetItemId: string,
        position: string,
        text: string
    ) {
        const displayItems = this.ctx.getDisplayItems();
        const targetItemIndex = displayItems.findIndex(item => item.model.id === targetItemId);
        if (targetItemIndex === -1) return;

        const targetItem = displayItems[targetItemIndex].model.original;

        let targetId = targetItemId;
        if (position === "middle") {
            const newText = text;
            targetItem.updateText((targetItem.text ?? "") + newText);
        } else {
            const parentItems = targetItem.parent || this.ctx.items;
            const siblings = parentItems as unknown as import("../../schema/app-schema").Items;
            let targetOrderIndex = -1;

            for (let i = 0; i < siblings.length; i++) {
                if (siblings.at(i)?.id === targetItemId) {
                    targetOrderIndex = i;
                    break;
                }
            }

            if (targetOrderIndex !== -1) {
                const insertIndex = position === "above" ? targetOrderIndex : targetOrderIndex + 1;
                const newItem = siblings.addNode(this.ctx.currentUser, insertIndex);
                if (newItem) {
                    newItem.updateText(text);
                    targetId = newItem.id;
                }
            }
        }

        this.ctx.triggerUpdate();
        editorOverlayStore.setCursor({
            itemId: targetId,
            offset: text.length,
            isActive: true,
            userId: "local",
        });
        editorOverlayStore.setActiveItem(targetId);
        editorOverlayStore.clearSelections();
    }

    private handleItemMoveDrop(sourceItemId: string, targetItemId: string, position: string) {
        const displayItems = this.ctx.getDisplayItems();
        const sourceIndex = displayItems.findIndex(item => item.model.id === sourceItemId);
        const targetIndex = displayItems.findIndex(item => item.model.id === targetItemId);

        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

        const sourceItem = displayItems[sourceIndex].model.original;
        const targetItem = displayItems[targetIndex].model.original;

        const sourceKey = sourceItem.key!;
        const targetKey = targetItem.key!;

        try {
            const tree = this.ctx.items.tree;
            const doc = this.ctx.pageItem?.ydoc;

            const sourceParent = tree.getNodeParentFromKey?.(sourceKey);
            const targetParent = tree.getNodeParentFromKey?.(targetKey);

            const run = () => {
                if (position === "middle") {
                    if (sourceParent !== targetKey) {
                        tree.moveChildToParent(sourceKey, targetKey);
                    }
                    if (typeof tree.recomputeParentsAndChildren === "function") {
                        tree.recomputeParentsAndChildren();
                    }
                    tree.setNodeOrderToEnd(sourceKey);
                    return;
                }

                if (sourceParent && targetParent && sourceParent !== targetParent) {
                    tree.moveChildToParent(sourceKey, targetParent);
                }

                if (typeof tree.recomputeParentsAndChildren === "function") {
                    tree.recomputeParentsAndChildren();
                }

                if (position === "above") {
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

            this.ctx.triggerUpdate();

            editorOverlayStore.setCursor({
                itemId: sourceItemId,
                offset: 0,
                isActive: true,
                userId: "local",
            });

            editorOverlayStore.setActiveItem(sourceItemId);
            editorOverlayStore.clearSelections();
        } catch (error) {
            logger.error({ error }, "Failed to move item:");
        }
    }

    private handleExternalAttachmentDrop(targetItemId: string, position: string, url: string) {
        const displayItems = this.ctx.getDisplayItems();
        const targetItem = displayItems.find(item => item.model.id === targetItemId)?.model.original;
        if (!targetItem) return;

        if (position === "middle") {
            try {
                targetItem.addAttachment(url);
            } catch {
                try { (targetItem as any).attachments?.push([url]); } catch {}
            }
        } else {
            const parentItems = targetItem.parent || this.ctx.items;
            const newItem = parentItems.addNode(this.ctx.currentUser);
            if (newItem) {
                // To safely implement above/below logic for attachments if it requires reordering
                // We'd reuse logic from move drop, but for now we fallback to the logic from external attachment drop in tree
                try {
                    newItem.addAttachment(url);
                } catch {
                    try { (newItem as any).attachments?.push([url]); } catch {}
                }

                // Reorder
                try {
                     const tree = this.ctx.items.tree;
                     const doc = this.ctx.pageItem?.ydoc;
                     const targetKey = targetItem.key!;
                     const sourceKey = newItem.key!;
                     const targetParent = tree.getNodeParentFromKey?.(targetKey);

                     const run = () => {
                         if (targetParent) {
                             tree.moveChildToParent(sourceKey, targetParent);
                         }
                         if (position === "above") {
                             tree.setNodeBefore(sourceKey, targetKey);
                         } else {
                             tree.setNodeAfter(sourceKey, targetKey);
                         }
                     }
                     if (doc?.transact) { doc.transact(run, "item-drop-reorder"); } else { run(); }
                } catch {}
            }
        }
        this.ctx.triggerUpdate();
    }

    private handleExternalTextDrop(targetItemId: string, position: string, text: string) {
        const displayItems = this.ctx.getDisplayItems();
        const targetItem = displayItems.find(item => item.model.id === targetItemId)?.model.original;
        if (!targetItem) return;

        if (position === "middle") {
            targetItem.updateText((targetItem.text ?? "") + text);
        } else {
            const parentItems = targetItem.parent || this.ctx.items;
            const newItem = parentItems.addNode(this.ctx.currentUser);
            if (newItem) {
                newItem.updateText(text);

                // Reorder
                try {
                     const tree = this.ctx.items.tree;
                     const doc = this.ctx.pageItem?.ydoc;
                     const targetKey = targetItem.key!;
                     const sourceKey = newItem.key!;
                     const targetParent = tree.getNodeParentFromKey?.(targetKey);

                     const run = () => {
                         if (targetParent) {
                             tree.moveChildToParent(sourceKey, targetParent);
                         }
                         if (position === "above") {
                             tree.setNodeBefore(sourceKey, targetKey);
                         } else {
                             tree.setNodeAfter(sourceKey, targetKey);
                         }
                     }
                     if (doc?.transact) { doc.transact(run, "item-drop-reorder"); } else { run(); }
                } catch {}
            }
        }

        this.ctx.triggerUpdate();
        editorOverlayStore.setCursor({
            itemId: targetItemId,
            offset: text.length,
            isActive: true,
            userId: "local",
        });
        editorOverlayStore.setActiveItem(targetItemId);
        editorOverlayStore.clearSelections();
    }

    handleTreeDragOver(event: DragEvent, isReadOnly: boolean) {
        if (isReadOnly) return;

        const dt = event.dataTransfer;
        if (dt) {
            const hasFiles = dt.types.includes("Files");
            const hasText = dt.types.includes("text/plain");
            if (hasFiles || hasText) {
                event.preventDefault();
                dt.dropEffect = "copy";
            }
        }
    }

    async handleTreeDrop(event: DragEvent, isReadOnly: boolean) {
        if (isReadOnly) return;

        const dt = event.dataTransfer;
        if (!dt) return;

        if (event.defaultPrevented) return;

        event.preventDefault();
        event.stopPropagation();

        const hasFiles = dt.types.includes("Files");

        if (hasFiles) {
            const files: File[] = Array.from(dt.files);
            if (files.length > 0) {
                let containerId: string | undefined = undefined;
                try { containerId = await getDefaultContainerId(); } catch {}
                if (!containerId && typeof window !== "undefined") {
                    try { containerId = window.localStorage?.getItem?.("currentContainerId") ?? undefined; } catch {}
                    try { containerId = containerId || (window as any).__CURRENT_PROJECT_TITLE__; } catch {}
                }
                containerId = containerId || "test-container";

                for (const file of files) {
                    try {
                        const newItem = this.ctx.items.addNode(this.ctx.currentUser, this.ctx.items.length);
                        if (newItem) {
                            await processAndUploadAttachment(containerId, newItem.id, file, (url) => {
                                addAttachmentSafely(newItem as any, url, import.meta.env?.MODE === 'test');
                            });
                        }
                    } catch (e) {
                        logger.error({ error: e as Error }, "Failed to upload file to tree bottom");
                    }
                }
                this.ctx.triggerUpdate();
            }
        } else {
            const plainText = dt.getData("text/plain");
            if (plainText) {
                const newItem = this.ctx.items.addNode(this.ctx.currentUser, this.ctx.items.length);
                if (newItem) {
                    newItem.updateText(plainText);
                }
                this.ctx.triggerUpdate();
            }
        }
    }
}
