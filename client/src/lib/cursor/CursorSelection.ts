// import type { Item } from "../../schema/yjs-schema"; // Not used
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
// import { store as generalStore } from "../../stores/store.svelte"; // Not used

export class CursorSelection {
    private cursor: any; // Holds the instance of the Cursor class

    constructor(cursor: any) {
        this.cursor = cursor;
    }

    /**
     * Clears the selection
     */
    clearSelection() {
        // Clear the selection
        store.clearSelectionForUser(this.cursor.userId);
    }

    /**
     * Extends the selection to the left
     */
    extendSelectionLeft() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Get the current selection
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // Extend if there is an existing selection
            if (existingSelection.isReversed) {
                // If the selection is reversed, move the start position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move the cursor to the left
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveLeft();

                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = true;

                // Invert direction if the selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveLeft();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.cursor.itemId;
                    endOffset = this.cursor.offset;
                    isReversed = true;
                }
            } else {
                // If the selection is forward, move the end position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move the cursor to the left
                this.cursor.moveLeft();

                startItemId = this.cursor.itemId;
                startOffset = this.cursor.offset;
                isReversed = false;

                // Invert direction if the selection disappears
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
            // Create a new selection
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // Move the cursor to the left
            this.cursor.moveLeft();

            endItemId = this.cursor.itemId;
            endOffset = this.cursor.offset;
            isReversed = true;
        }

        // Clear existing selection for the same user before setting a new one
        store.clearSelectionForUser(this.cursor.userId);
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // Set selection range for the global text area
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    /**
     * Extends the selection to the right
     */
    extendSelectionRight() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Get the current selection
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // Extend if there is an existing selection
            if (!existingSelection.isReversed) {
                // If the selection is forward, move the end position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move the cursor to the right
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveRight();

                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = false;

                // Invert direction if the selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveRight();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.cursor.itemId;
                    endOffset = this.cursor.offset;
                    isReversed = false;
                }
            } else {
                // If the selection is reversed, move the start position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move the cursor to the right
                this.cursor.moveRight();

                startItemId = this.cursor.itemId;
                startOffset = this.cursor.offset;
                isReversed = true;

                // Invert direction if the selection disappears
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
            // Create a new selection
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // Move the cursor to the right
            this.cursor.moveRight();

            endItemId = this.cursor.itemId;
            endOffset = this.cursor.offset;
            isReversed = false;
        }

        // Set selection range
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // Set selection range for the global text area
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    /**
     * Extends the selection upward
     */
    extendSelectionUp() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Get the current selection
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // Extend if there is an existing selection
            if (existingSelection.isReversed) {
                // If the selection is reversed, move the start position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move the cursor up
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveUp();

                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = true;

                // Invert direction if the selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveUp();

                    startItemId = this.cursor.itemId;
                    startOffset = this.cursor.offset;
                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    isReversed = false;
                }
            } else {
                // If the selection is forward, move the end position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move the cursor up
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveUp();

                startItemId = this.cursor.itemId;
                startOffset = this.cursor.offset;
                isReversed = false;

                // Invert direction if the selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveUp();

                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    startItemId = this.cursor.itemId;
                    startOffset = this.cursor.offset;
                    isReversed = true;
                }
            }
        } else {
            // Create a new selection
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // Move the cursor up
            this.cursor.moveUp();

            endItemId = this.cursor.itemId;
            endOffset = this.cursor.offset;
            isReversed = true;
        }

        // Set selection range
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // Set selection range for the global text area
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    /**
     * Extends the selection downward
     */
    extendSelectionDown() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Debug info
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`extendSelectionDown called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // Get the current selection
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // Extend if there is an existing selection
            if (!existingSelection.isReversed) {
                // If the selection is forward, move the end position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move the cursor down
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveDown();

                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = false;

                // Debug info
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Extending forward selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }

                // Invert direction if the selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveDown();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.cursor.itemId;
                    endOffset = this.cursor.offset;
                    isReversed = false;

                    // Debug info
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `Selection disappeared, reversed: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                        );
                    }
                }
            } else {
                // If the selection is reversed, move the start position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move the cursor down
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveDown();

                startItemId = this.cursor.itemId;
                startOffset = this.cursor.offset;
                isReversed = true;

                // Debug info
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Extending reversed selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }

                // Invert direction if the selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveDown();

                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    startItemId = this.cursor.itemId;
                    startOffset = this.cursor.offset;
                    isReversed = false;

                    // Debug info
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `Selection disappeared, reversed: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                        );
                    }
                }
            }
        } else {
            // Create a new selection
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // Save current position
            const oldItemId = this.cursor.itemId;
            // const oldOffset = this.cursor.offset; // Not used

            // Move the cursor down
            this.cursor.moveDown();

            // Select all text if the destination is within the same item
            if (this.cursor.itemId === oldItemId) {
                // const text = target.text || ""; // Not used
                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = false;

                // Debug info
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `New selection within same item: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }
            } else {
                // If moved to another item
                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset; // Select up to the current position of the next item (was previously fixed to 0)
                isReversed = false;

                // Debug info
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `New selection across items: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }
            }
        }

        // Set selection direction appropriately (removed forced setting for testing)
        // Determine direction by offset if start and end are the same item
        if (startItemId === endItemId) {
            isReversed = startOffset > endOffset;
        } // Determine direction by order in DOM if items are different
        else {
            const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
            const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);
            const startIdx = allItemIds.indexOf(startItemId);
            const endIdx = allItemIds.indexOf(endItemId);

            // Default to forward direction if index is not found
            if (startIdx === -1 || endIdx === -1) {
                isReversed = false;
            } else {
                isReversed = startIdx > endIdx;
            }
        }

        // Clear existing selection for the same user before setting a new one
        store.clearSelectionForUser(this.cursor.userId);
        const selectionId = store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // Debug info
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection created with ID: ${selectionId}, isReversed=${isReversed}`);
            console.log(`Current selections:`, store.selections);
        }

        // Set selection range for the global text area
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // Wait a bit for the DOM to reflect to ensure the selection is created correctly
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

                // If selection range is not displayed, set it again
                if (selectionElements.length === 0) {
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.cursor.userId,
                        isReversed,
                    });

                    // Force update selection display
                    store.forceUpdate();
                }
            }, 150); // Increase timeout to 150ms to wait longer for DOM updates
        }
    }

    /**
     * Moves the cursor to the beginning of the line
     */
    moveToLineStart() {
        const target = this.cursor.findTarget();
        if (!target) return;

        const text = target.text || "";
        const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);

        // Move to the start position of the current line
        this.cursor.offset = this.cursor.getLineStartOffset(text, currentLineIndex);
        this.cursor.applyToStore();

        // Ensure the cursor is updated correctly
        store.startCursorBlink();
    }

    /**
     * Moves the cursor to the end of the line
     */
    moveToLineEnd() {
        const target = this.cursor.findTarget();
        if (!target) return;

        const text = target.text || "";
        const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);

        // Move to the end position of the current line
        this.cursor.offset = this.cursor.getLineEndOffset(text, currentLineIndex);
        this.cursor.applyToStore();

        // Ensure the cursor is updated correctly
        store.startCursorBlink();
    }

    /**
     * Extends the selection to the beginning of the line
     */
    extendSelectionToLineStart() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Debug info
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `extendSelectionToLineStart called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`,
            );
        }

        // Get the current selection
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = target.text || "";
        const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);
        const lineStartOffset = this.cursor.getLineStartOffset(text, currentLineIndex);

        // Debug info
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Current line index: ${currentLineIndex}, lineStartOffset: ${lineStartOffset}, text: "${text}"`,
            );
        }

        // Do nothing if the cursor is already at the beginning of the line
        if (this.cursor.offset === lineStartOffset && !existingSelection) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Already at line start, no selection created`);
            }
            return;
        }

        if (existingSelection) {
            // Extend if there is an existing selection
            if (existingSelection.isReversed) {
                // If the selection is reversed, move the start position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move the cursor to the beginning of the line
                endItemId = this.cursor.itemId;
                endOffset = lineStartOffset;
                isReversed = true;
            } else {
                // If the selection is forward, move the end position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move the cursor to the beginning of the line
                startItemId = this.cursor.itemId;
                startOffset = lineStartOffset;
                isReversed = false;
            }
        } else {
            // Create a new selection
            // Select from current position to the beginning of the line
            startItemId = this.cursor.itemId;
            endItemId = this.cursor.itemId;

            // Determine direction based on the relationship between current position and line start
            if (this.cursor.offset > lineStartOffset) {
                // Normal case (cursor is in the middle of the line)
                startOffset = this.cursor.offset;
                endOffset = lineStartOffset;
                isReversed = true; // Reversed because selecting towards the beginning of the line
            } else {
                // If the cursor is at the beginning of the line (usually does not enter here)
                startOffset = lineStartOffset;
                endOffset = this.cursor.offset;
                isReversed = false;
            }
        }

        // Debug info
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Setting selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}, isReversed=${isReversed}`,
            );
        }

        // Set selection range
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // Move cursor position to the beginning of the line
        this.cursor.offset = lineStartOffset;
        this.cursor.applyToStore();

        // Set selection range for the global text area
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    /**
     * Extends the selection to the end of the line
     */
    extendSelectionToLineEnd() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Debug info
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `extendSelectionToLineEnd called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`,
            );
        }

        // Get the current selection
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = target.text || "";
        const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);
        const lineEndOffset = this.cursor.getLineEndOffset(text, currentLineIndex);

        // Debug info
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Current line index: ${currentLineIndex}, lineEndOffset: ${lineEndOffset}, text: "${text}"`);
        }

        // Do nothing if the cursor is already at the end of the line
        if (this.cursor.offset === lineEndOffset && !existingSelection) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Already at line end, no selection created`);
            }
            return;
        }

        if (existingSelection) {
            // Extend if there is an existing selection
            if (!existingSelection.isReversed) {
                // If the selection is forward, move the end position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move the cursor to the end of the line
                endItemId = this.cursor.itemId;
                endOffset = lineEndOffset;
                isReversed = false;
            } else {
                // If the selection is reversed, move the start position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move the cursor to the end of the line
                startItemId = this.cursor.itemId;
                startOffset = lineEndOffset;
                isReversed = true;
            }
        } else {
            // Create a new selection
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // Select up to the end of the line
            endItemId = this.cursor.itemId;
            endOffset = lineEndOffset;
            isReversed = this.cursor.offset > lineEndOffset;
        }

        // Debug info
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Setting selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}, isReversed=${isReversed}`,
            );
        }

        // Set selection range
        const selectionId = store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // Debug info
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection created with ID: ${selectionId}`);
            console.log(`Current selections:`, store.selections);
        }

        // Move cursor position to the end of the line
        this.cursor.offset = lineEndOffset;
        this.cursor.applyToStore();

        // Set selection range for the global text area
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // Wait a bit for the DOM to reflect to ensure the selection is created correctly
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

                // If selection range is not displayed, set it again
                if (selectionElements.length === 0) {
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.cursor.userId,
                        isReversed,
                    });

                    // Force update selection display
                    store.forceUpdate();
                }
            }, 100); // Increase timeout to 100ms to wait longer for DOM updates

            // Additional check and update
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (selectionElements.length === 0) {
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Selection still not visible after 100ms, forcing update again`);
                    }

                    // Reset selection
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.cursor.userId,
                        isReversed,
                    });

                    // Force update
                    store.forceUpdate();
                }
            }, 200);
        }
    }
}
