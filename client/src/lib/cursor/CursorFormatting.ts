// import type { Item } from "../../schema/yjs-schema"; // Not used
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import { ScrapboxFormatter } from "../../utils/ScrapboxFormatter";

export class CursorFormatting {
    private cursor: any; // Holds an instance of the Cursor class

    constructor(cursor: any) {
        this.cursor = cursor;
    }

    /**
     * Change the selected text to bold (Scrapbox syntax: [[text]])
     */
    formatBold() {
        this.applyScrapboxFormatting("bold");
    }

    /**
     * Change the selected text to italic (Scrapbox syntax: [/ text])
     */
    formatItalic() {
        this.applyScrapboxFormatting("italic");
    }

    /**
     * Add underline to the selected text (Uses HTML tags)
     */
    formatUnderline() {
        this.applyScrapboxFormatting("underline");
    }

    /**
     * Add strikethrough to the selected text (Scrapbox syntax: [- text])
     */
    formatStrikethrough() {
        this.applyScrapboxFormatting("strikethrough");
    }

    /**
     * Change the selected text to code (Scrapbox syntax: `text`)
     */
    formatCode() {
        this.applyScrapboxFormatting("code");
    }

    /**
     * Apply Scrapbox syntax formatting to the selected range
     * @param formatType Format type ('bold', 'italic', 'strikethrough', 'underline', 'code')
     */
    private applyScrapboxFormatting(formatType: "bold" | "italic" | "strikethrough" | "underline" | "code") {
        // Get selection range
        const selection = Object.values(store.selections).find(s => s.userId === this.cursor.userId);

        if (!selection || selection.startOffset === selection.endOffset) {
            // Do nothing if there is no selection
            return;
        }

        // If selection spans multiple items
        if (selection.startItemId !== selection.endItemId) {
            this.applyScrapboxFormattingToMultipleItems(selection, formatType);
            return;
        }

        // If selection is within a single item
        const target = this.cursor.findTarget();
        if (!target) return;

        const text = target.text || "";
        const startOffset = Math.min(selection.startOffset, selection.endOffset);
        const endOffset = Math.max(selection.startOffset, selection.endOffset);
        const selectedText = text.substring(startOffset, endOffset);

        // Create formatted text
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

        // Update text
        const newText = text.substring(0, startOffset) + formattedText + text.substring(endOffset);
        target.updateText(newText);

        // Update cursor position (set to end of selection)
        this.cursor.offset = startOffset + formattedText.length;
        this.cursor.applyToStore();

        // Clear selection
        this.cursor.clearSelection();

        // Start cursor blinking
        store.startCursorBlink();
    }

    /**
     * Apply Scrapbox syntax formatting to selection spanning multiple items
     */
    private applyScrapboxFormattingToMultipleItems(
        selection: any,
        formatType: "bold" | "italic" | "strikethrough" | "underline" | "code",
    ) {
        // Get start and end item IDs
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;
        const startOffset = selection.startOffset;
        const endOffset = selection.endOffset;
        const isReversed = selection.isReversed;

        // Get all item IDs
        const allItemElements = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
        const allItemIds = allItemElements.map(el => el.getAttribute("data-item-id")!);

        // Get start and end item indices
        const startIdx = allItemIds.indexOf(startItemId);
        const endIdx = allItemIds.indexOf(endItemId);

        if (startIdx === -1 || endIdx === -1) return;

        // Normalize start and end indices
        const firstIdx = Math.min(startIdx, endIdx);
        const lastIdx = Math.max(startIdx, endIdx);

        // Apply format to each item in the selection
        for (let i = firstIdx; i <= lastIdx; i++) {
            const itemId = allItemIds[i];
            const item = this.cursor.searchItem(generalStore.currentPage!, itemId);

            if (!item) continue;

            const text = item.text || "";

            // Apply format according to item position
            if (i === firstIdx && i === lastIdx) {
                // Selection within a single item
                const start = isReversed ? endOffset : startOffset;
                const end = isReversed ? startOffset : endOffset;
                const selectedText = text.substring(start, end);

                // Create formatted text
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
                // If selection spans multiple items, process each item individually.
                // Currently only single item selection is supported.
                // Add implementation here for multi-item selection support.
            }
        }

        // Update cursor position (set to end of selection)
        this.cursor.itemId = isReversed ? startItemId : endItemId;
        this.cursor.offset = isReversed ? startOffset : endOffset;
        this.cursor.applyToStore();

        // Clear selection
        this.cursor.clearSelection();

        // Start cursor blinking
        store.startCursorBlink();
    }
}
