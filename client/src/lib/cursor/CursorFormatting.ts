// import type { Item } from "../../schema/yjs-schema"; // Not used
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import { escapeId } from "../../utils/domUtils";
import { ScrapboxFormatter } from "../../utils/ScrapboxFormatter";

export class CursorFormatting {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private cursor: any; // Holds an instance of the Cursor class

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selection: any,
        formatType: "bold" | "italic" | "strikethrough" | "underline" | "code",
    ) {
        // Get start and end item IDs
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;
        const startOffset = selection.startOffset;
        const endOffset = selection.endOffset;
        const isReversed = selection.isReversed;

        const startEl = document.querySelector(`[data-item-id="${escapeId(startItemId)}"]`);
        const endEl = document.querySelector(`[data-item-id="${escapeId(endItemId)}"]`);

        if (!startEl || !endEl) return;

        // Determine order
        const comparison = startEl.compareDocumentPosition(endEl);
        let firstEl: Element, lastEl: Element;

        if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) {
            firstEl = startEl;
            lastEl = endEl;
        } else {
            firstEl = endEl;
            lastEl = startEl;
        }

        const root = document.querySelector(".outliner") || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
            acceptNode(node) {
                return (node as Element).hasAttribute("data-item-id")
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_SKIP;
            },
        });
        walker.currentNode = firstEl;

        // Apply format to each item in the selection
        while (walker.currentNode) {
            const current = walker.currentNode as HTMLElement;
            const itemId = current.getAttribute("data-item-id")!;
            const item = this.cursor.searchItem(generalStore.currentPage!, itemId);

            if (!item) {
                if (current === lastEl) break;
                if (!walker.nextNode()) break;
                continue;
            }

            const text = item.text || "";

            // Apply format according to item position
            if (current === firstEl && current === lastEl) {
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

            if (current === lastEl) break;
            if (!walker.nextNode()) break;
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
