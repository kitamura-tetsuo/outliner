import type { OutlinerViewModel } from "../stores/OutlinerViewModel";
import type { EditorOverlayStore } from "../stores/EditorOverlayStore.svelte";

export class TreeDnD {
    private viewModel: OutlinerViewModel;
    private editorOverlayStore: EditorOverlayStore;
    private isReadOnly: boolean;

    dragStartItemId: string | null = null;
    dragStartOffset = 0;
    dragCurrentItemId: string | null = null;
    dragCurrentOffset = 0;

    constructor(viewModel: OutlinerViewModel, editorOverlayStore: EditorOverlayStore, isReadOnly: boolean) {
        this.viewModel = viewModel;
        this.editorOverlayStore = editorOverlayStore;
        this.isReadOnly = isReadOnly;
    }

    setReadOnly(isReadOnly: boolean) {
        this.isReadOnly = isReadOnly;
    }

    handleItemDragStart(event: CustomEvent<{ itemId: string; offset?: number }>, displayItems: any[]) {
        if (this.isReadOnly) return;

        const { itemId, offset } = event.detail;

        this.dragStartItemId = itemId;
        this.dragStartOffset = offset ?? 0;
        this.dragCurrentItemId = itemId;
        this.dragCurrentOffset = offset ?? 0;

        this.updateDragSelection(displayItems);
    }

    handleItemDrag(event: CustomEvent<{ itemId: string; offset: number }>, displayItems: any[], isDragging: boolean) {
        if (this.isReadOnly || !isDragging || !this.dragStartItemId) return;

        const { itemId, offset } = event.detail;

        if (this.dragCurrentItemId !== itemId || this.dragCurrentOffset !== offset) {
            this.dragCurrentItemId = itemId;
            this.dragCurrentOffset = offset;
            this.updateDragSelection(displayItems);
        }
    }

    handleItemDragEnd() {
        if (this.isReadOnly) return;

        this.dragStartItemId = null;
        this.dragCurrentItemId = null;
    }

    clearDragSelection() {
        this.editorOverlayStore.clearSelections();
    }

    private updateDragSelection(displayItems: any[]) {
        if (!this.dragStartItemId || !this.dragCurrentItemId) return;

        // Find items in flat display list
        const startIndex = displayItems.findIndex(
            (item) => item.model.id === this.dragStartItemId,
        );
        const currentIndex = displayItems.findIndex(
            (item) => item.model.id === this.dragCurrentItemId,
        );

        if (startIndex === -1 || currentIndex === -1) return;

        const isReversed = startIndex > currentIndex ||
            (startIndex === currentIndex &&
                this.dragStartOffset > this.dragCurrentOffset);

        // Determine start and end based on visual order
        const startItemId = isReversed ? this.dragCurrentItemId : this.dragStartItemId;
        const startOffset = isReversed ? this.dragCurrentOffset : this.dragStartOffset;
        const endItemId = isReversed ? this.dragStartItemId : this.dragCurrentItemId;
        const endOffset = isReversed ? this.dragStartOffset : this.dragCurrentOffset;

        // Set selection range (replace the previous drag selection instead of
        // accumulating)
        this.editorOverlayStore.setSelection({
            startItemId: startItemId as string,
            startOffset: startOffset,
            endItemId: endItemId as string,
            endOffset: endOffset,
            userId: "local",
            isReversed: isReversed
        });

        // Update cursor position
        this.editorOverlayStore.setCursor({
            itemId: this.dragCurrentItemId as string,
            offset: this.dragCurrentOffset,
            isActive: true,
            userId: "local",
        });

        // Set active item for styling
        this.editorOverlayStore.setActiveItem(this.dragCurrentItemId);
    }
}
