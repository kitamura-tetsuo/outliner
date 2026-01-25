/**
 * Key event handler
 * Manages complex key event handling logic (e.g., IME support, special key combinations).
 */

import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
import { store } from "../stores/store.svelte";
import { keyMap } from "./CustomKeyMap.svelte";
import { getLogger } from "./logger";

const logger = getLogger("KeyEventHandler");

export class KeyEventHandler {
    static handleKeyDown(event: KeyboardEvent) {
        // Log key press
        logger.debug(`Key down: ${event.key} (code: ${event.code})`, {
            ctrl: event.ctrlKey,
            meta: event.metaKey,
            alt: event.altKey,
            shift: event.shiftKey,
            isComposing: event.isComposing,
        });

        // Ignore processing during IME composition (for Enter etc.)
        // But some keys might need to be allowed?
        if (event.isComposing) return;

        // Alias picker operation
        if (aliasPickerStore.isVisible) {
            // Processing when alias picker is visible
            // Usually, focus is on input inside AliasPicker, so it might not come here,
            // but if focus is on GlobalTextArea, process it.
            if (event.key === "ArrowDown") {
                event.preventDefault();
                aliasPickerStore.moveSelection(1);
                return;
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                aliasPickerStore.moveSelection(-1);
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                aliasPickerStore.confirmSelection();
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                aliasPickerStore.hide();
                return;
            }
        }

        // Box selection operation (Alt+Shift+Arrow)
        if (
            event.altKey && event.shiftKey
            && (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft"
                || event.key === "ArrowRight")
        ) {
            // Box selection movement
            this.handleBoxSelectionKey(event);
            return;
        }

        // Custom key map check
        const command = keyMap.getCommand(event);
        if (command) {
            this.executeCommand(command, event);
            return;
        }

        // Default behavior (input of character keys etc.) is handled by handleInput
    }

    static handleInput(event: Event) {
        const inputEvent = event as InputEvent;
        // Text input processing
        if (inputEvent.inputType === "insertText" && inputEvent.data) {
            this.insertText(inputEvent.data);
        } else if (inputEvent.inputType === "insertCompositionText" && inputEvent.data) {
            // Handled by handleCompositionUpdate
        }
    }

    static handleCompositionStart(event: CompositionEvent) {
        logger.debug("Composition start");
        store.setIsComposing(true);
    }

    static handleCompositionUpdate(event: CompositionEvent) {
        logger.debug("Composition update:", event.data);
        // Update temporary display during IME input?
    }

    static handleCompositionEnd(event: CompositionEvent) {
        logger.debug("Composition end:", event.data);
        store.setIsComposing(false);
        if (event.data) {
            this.insertText(event.data);
        }
    }

    static handleCopy(event: ClipboardEvent) {
        const selectedText = editorOverlayStore.getSelectedText("local");
        if (selectedText) {
            event.clipboardData?.setData("text/plain", selectedText);
            event.preventDefault();
            logger.debug("Copied text:", selectedText);
        }
    }

    static handleCut(event: ClipboardEvent) {
        const selectedText = editorOverlayStore.getSelectedText("local");
        if (selectedText) {
            event.clipboardData?.setData("text/plain", selectedText);
            event.preventDefault();

            // Delete text
            // Implementation required: Delete range
            this.deleteSelection();

            logger.debug("Cut text:", selectedText);
        }
    }

    static async handlePaste(event: ClipboardEvent) {
        // Get text from clipboard
        const text = event.clipboardData?.getData("text/plain");
        if (text) {
            event.preventDefault();
            this.insertText(text);
            logger.debug("Pasted text:", text);
        }
    }

    // Command execution
    private static executeCommand(command: string, event: KeyboardEvent) {
        logger.debug(`Executing command: ${command}`);
        event.preventDefault();

        switch (command) {
            case "newItem":
                // Add new item
                this.addNewItem();
                break;
            case "indent":
                this.indentItem();
                break;
            case "unindent":
                this.unindentItem();
                break;
                // ... Other commands
        }
    }

    // Helper methods
    private static insertText(text: string) {
        const activeItemId = editorOverlayStore.getActiveItem();
        if (!activeItemId) return;

        // Update item text
        // Need to access Yjs/Item model...
        // Access via store or event dispatch

        // Simplified implementation: Dispatch event or use store method
        // Access item via store.project...
    }

    private static deleteSelection() {
        // Delete selection range
    }

    private static addNewItem() {
        // Add new item
    }

    private static indentItem() {
        // Indent
    }

    private static unindentItem() {
        // Unindent
    }

    private static handleBoxSelectionKey(event: KeyboardEvent) {
        // Handle box selection key operations
    }
}
