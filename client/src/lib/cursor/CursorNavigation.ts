import type { Item } from "../../schema/yjs-schema";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
// import { store as generalStore } from "../../stores/store.svelte"; // Not used

// Define a generic cursor interface that we expect
interface Cursor {
    itemId: string;
    offset: number;
    userId: string;
    cursorId?: string;
    initialColumn: number | null;
    resetInitialColumn(): void;
    findTarget(): Item | null;
    findPreviousItem(): Item | null;
    findNextItem(): Item | null;
    clearSelection(): void;
    applyToStore(): void;
    getVisualLineInfo(
        itemId: string,
        offset: number,
    ): { lineIndex: number; lineStartOffset: number; totalLines: number; } | null;
    getCurrentLineIndex(text: string, offset: number): number;
    getLineStartOffset(text: string, lineIndex: number): number;
    getVisualLineOffsetRange(itemId: string, lineIndex: number): { startOffset: number; endOffset: number; } | null;
    getLineEndOffset(text: string, lineIndex: number): number;
    getCurrentColumn(text: string, offset: number): number;
    // Add other required methods as needed
}

export class CursorNavigation {
    private cursor: Cursor; // Hold Cursor class instance

    constructor(cursor: Cursor) {
        this.cursor = cursor;
    }

    /**
     * Move cursor left
     */
    moveLeft() {
        // Reset initial column position since this is not an up/down key operation
        this.cursor.resetInitialColumn();

        const target = this.cursor.findTarget();
        if (!target) return;

        if (this.cursor.offset > 0) {
            this.cursor.offset = Math.max(0, this.cursor.offset - 1);
            this.cursor.applyToStore();

            // Confirm cursor is updated correctly
            store.startCursorBlink();
        } else {
            // Move to previous item at start of line
            this.navigateToItem("left");
        }
    }

    /**
     * Move cursor right
     */
    moveRight() {
        // Reset initial column position since this is not an up/down key operation
        this.cursor.resetInitialColumn();

        const target = this.cursor.findTarget();
        const text = target?.text ?? "";

        // Increase offset only if text is not empty
        if (text.length > 0 && this.cursor.offset < text.length) {
            this.cursor.offset = this.cursor.offset + 1;
            this.cursor.applyToStore();

            // Confirm cursor is updated correctly
            store.startCursorBlink();
        } else {
            // Move to next item if at end of line or text is empty
            this.navigateToItem("right");
        }
    }

    /**
     * Move cursor up
     */
    moveUp() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`moveUp called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // Get visual line info
        const visualLineInfo = this.cursor.getVisualLineInfo(this.cursor.itemId, this.cursor.offset);

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // Fallback: Logical line processing (based on newline characters)
            const text = (target.text && typeof target.text.toString === "function") ? target.text.toString() : "";
            const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);
            if (currentLineIndex > 0) {
                const prevLineStart = this.cursor.getLineStartOffset(text, currentLineIndex - 1);
                this.cursor.offset = prevLineStart;
                this.cursor.applyToStore();
                store.startCursorBlink();
            } else {
                this.navigateToItem("up");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // Calculate current column position (position within visual line)
        const currentColumn = this.cursor.offset - lineStartOffset;

        // Set or update initial column position
        if (this.cursor.initialColumn === null) {
            this.cursor.initialColumn = currentColumn;
        }

        // Column position to use (initial column position)
        const targetColumn = this.cursor.initialColumn;

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex > 0) {
            // Move to previous visual line within same item
            const prevLineRange = this.cursor.getVisualLineOffsetRange(this.cursor.itemId, lineIndex - 1);
            if (prevLineRange) {
                const prevLineLength = prevLineRange.endOffset - prevLineRange.startOffset;
                // Move to shorter of initial column position or line length
                this.cursor.offset = prevLineRange.startOffset + Math.min(targetColumn, prevLineLength);
                this.cursor.applyToStore();

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moved to previous visual line in same item: offset=${this.cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blinking
                store.startCursorBlink();
            }
        } else {
            // Find previous item
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                // Move to last visual line of previous item
                this.navigateToItem("up");

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moved to previous item: itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
                }
            } else {
                // If no previous item, move to start of current item
                if (this.cursor.offset > 0) {
                    this.cursor.offset = 0;
                    this.cursor.applyToStore();

                    // Confirm cursor is updated correctly
                    store.startCursorBlink();

                    // Debug info
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`Moved to start of current item: offset=${this.cursor.offset}`);
                    }
                }
            }
        }
    }

    /**
     * Move cursor down
     */
    moveDown() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`moveDown called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // Get visual line info
        const visualLineInfo = this.cursor.getVisualLineInfo(this.cursor.itemId, this.cursor.offset);

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // Fallback: Logical line processing (based on newline characters)
            const text = (target.text && typeof target.text.toString === "function") ? target.text.toString() : "";
            const lines = text.split("\n");
            const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);
            if (currentLineIndex < lines.length - 1) {
                const nextLineStart = this.cursor.getLineStartOffset(text, currentLineIndex + 1);
                this.cursor.offset = nextLineStart;
                this.cursor.applyToStore();
                store.startCursorBlink();
            } else {
                this.navigateToItem("down");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // Calculate current column position (position within visual line)
        const currentColumn = this.cursor.offset - lineStartOffset;

        // Set or update initial column position
        if (this.cursor.initialColumn === null) {
            this.cursor.initialColumn = currentColumn;
        }

        // Column position to use (initial column position)
        const targetColumn = this.cursor.initialColumn;

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex < totalLines - 1) {
            // Move to next visual line within same item
            const nextLineRange = this.cursor.getVisualLineOffsetRange(this.cursor.itemId, lineIndex + 1);
            if (nextLineRange) {
                const nextLineLength = nextLineRange.endOffset - nextLineRange.startOffset;
                // Move to shorter of initial column position or line length
                this.cursor.offset = nextLineRange.startOffset + Math.min(targetColumn, nextLineLength);
                this.cursor.applyToStore();

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moved to next visual line in same item: offset=${this.cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blinking
                store.startCursorBlink();
            }
        } else {
            // Find next item
            const nextItem = this.cursor.findNextItem();
            if (nextItem) {
                // Move to first visual line of next item
                this.navigateToItem("down");

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moved to next item: itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
                }
            } else {
                // If no next item, move to end of current item
                const text = (target.text && typeof target.text.toString === "function") ? target.text.toString() : "";
                if (this.cursor.offset < text.length) {
                    this.cursor.offset = text.length;
                    this.cursor.applyToStore();

                    // Confirm cursor is updated correctly
                    store.startCursorBlink();

                    // Debug info
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`Moved to end of current item: offset=${this.cursor.offset}`);
                    }
                }
            }
        }
    }

    /**
     * Navigate between items
     * @param direction Direction to move
     */
    navigateToItem(direction: "left" | "right" | "up" | "down") {
        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(
                `navigateToItem called with direction=${direction}, itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`,
            );
        }

        // Navigate to prev/next item only updates store, event emission handled by component
        const oldItemId = this.cursor.itemId;
        let newItemId = this.cursor.itemId; // Default is current item
        let newOffset = this.cursor.offset; // Default is current offset
        let itemChanged = false;

        // Get text of current item
        const currentTarget = this.cursor.findTarget();
        const currentText = (currentTarget?.text && typeof currentTarget.text.toString === "function")
            ? currentTarget.text.toString()
            : "";
        const currentColumn = this.cursor.getCurrentColumn(currentText, this.cursor.offset);

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`Current column: ${currentColumn}, current text: "${currentText}"`);
        }

        // Handle item navigation
        if (direction === "left") {
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                newItemId = prevItem.id;
                newOffset = prevItem.text?.length || 0;
                itemChanged = true;

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moving left to previous item: id=${prevItem.id}, offset=${newOffset}`);
                }
            } else {
                // If no previous item, move to start of current item
                const target = this.cursor.findTarget();
                if (target) {
                    newOffset = 0;

                    // Debug info
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`No previous item, moving to start of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "right") {
            const nextItem = this.cursor.findNextItem();
            if (nextItem) {
                newItemId = nextItem.id;
                newOffset = 0;
                itemChanged = true;

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moving right to next item: id=${nextItem.id}, offset=${newOffset}`);
                }
            } else {
                // If no next item, move to end of current item
                const target = this.cursor.findTarget();
                if (target) {
                    newOffset = target.text?.length || 0;

                    // Debug info
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "up") {
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                newItemId = prevItem.id;
                const prevText = (prevItem.text && typeof prevItem.text.toString === "function")
                    ? prevItem.text.toString()
                    : "";
                const prevLines = prevText.split("\n");
                const lastLineIndex = prevLines.length - 1;
                const lastLineStart = this.cursor.getLineStartOffset(prevText, lastLineIndex);
                const lastLineEnd = this.cursor.getLineEndOffset(prevText, lastLineIndex);
                const lastLineLength = lastLineEnd - lastLineStart;

                // Calculate position with smallest x-coordinate change
                // Select position closest to initial or current column position
                // Ensure not to exceed length of last line of previous item
                const targetColumn = Math.min(
                    this.cursor.initialColumn !== null ? this.cursor.initialColumn : currentColumn,
                    lastLineLength,
                );
                newOffset = lastLineStart + targetColumn;

                // Special case: If current cursor is at start of line (offset 0),
                // move to start of last line of previous item
                if (this.cursor.offset === 0) {
                    newOffset = lastLineStart;
                }

                itemChanged = true;

                // Debug info
                console.log(
                    `navigateToItem up - Moving to previous item's last line: itemId=${prevItem.id}, offset=${newOffset}, targetColumn=${targetColumn}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}`,
                );
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moving up to previous item's last line: id=${prevItem.id}, lastLineIndex=${lastLineIndex}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}`,
                    );
                }
            } else {
                // If no previous item, move to start of current item
                newOffset = 0;

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`No previous item, moving to start of current item: offset=${newOffset}`);
                }
            }
        } else if (direction === "down") {
            const nextItem = this.cursor.findNextItem();
            if (nextItem) {
                newItemId = nextItem.id;
                const nextText = (nextItem.text && typeof nextItem.text.toString === "function")
                    ? nextItem.text.toString()
                    : "";
                // const nextLines = nextText.split("\n"); // Not used
                const firstLineIndex = 0;
                const firstLineStart = this.cursor.getLineStartOffset(nextText, firstLineIndex);
                const firstLineEnd = this.cursor.getLineEndOffset(nextText, firstLineIndex);
                const firstLineLength = firstLineEnd - firstLineStart;

                // Calculate position with smallest x-coordinate change
                // Select position closest to initial or current column position
                // Ensure not to exceed length of first line of next item
                const targetColumn = Math.min(
                    this.cursor.initialColumn !== null ? this.cursor.initialColumn : currentColumn,
                    firstLineLength,
                );
                newOffset = firstLineStart + targetColumn;

                // Special case: If current cursor is at end of line (offset is text length),
                // move to end of first line of next item
                const currentTargetDown = this.cursor.findTarget();
                const currentTextDown =
                    (currentTargetDown?.text && typeof currentTargetDown.text.toString === "function")
                        ? currentTargetDown.text.toString()
                        : "";
                if (this.cursor.offset === currentTextDown.length) {
                    newOffset = firstLineEnd;
                }

                itemChanged = true;

                // Debug info
                console.log(
                    `navigateToItem down - Moving to next item's first line: itemId=${nextItem.id}, offset=${newOffset}, targetColumn=${targetColumn}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}`,
                );
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moving down to next item's first line: id=${nextItem.id}, firstLineIndex=${firstLineIndex}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}`,
                    );
                }
            } else {
                // If no next item, move to end of current item
                const target = this.cursor.findTarget();
                if (target) {
                    newOffset = target.text?.length || 0;

                    // Debug info
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        }

        // Execute only if item changed
        if (itemChanged) {
            // Debug info
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Item changed: oldItemId=${oldItemId}, newItemId=${newItemId}, newOffset=${newOffset}`);
            }

            // Ensure old item cursor is removed before move
            store.clearCursorForItem(oldItemId);

            // Remove other cursors of same user (maintain single cursor mode)
            // Note: Clear only cursors of same user, not all cursors
            const cursorsToRemove = Object.values(store.cursors)
                .filter(c => c.userId === this.cursor.userId && c.cursorId !== this.cursor.cursorId)
                .map(c => c.cursorId);

            // Debug info
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Removing cursors: ${cursorsToRemove.join(", ")}`);
            }

            // Clear selection
            this.cursor.clearSelection();

            // Remove existing cursor in target item (prevent duplication)
            // Note: Delete only cursors of same user
            const cursorsInTargetItem = Object.values(store.cursors)
                .filter(c => c.itemId === newItemId && c.userId === this.cursor.userId)
                .map(c => c.cursorId);

            // Debug info
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Removing cursors in target item: ${cursorsInTargetItem.join(", ")}`);
            }

            // Set new item and offset
            this.cursor.itemId = newItemId;
            this.cursor.offset = newOffset;

            // Update active item
            store.setActiveItem(this.cursor.itemId);

            // Create new cursor
            const cursorId = store.setCursor({
                itemId: this.cursor.itemId,
                offset: this.cursor.offset,
                isActive: true,
                userId: this.cursor.userId,
            });

            // Update cursorId
            this.cursor.cursorId = cursorId;

            // Start cursor blinking
            store.startCursorBlink();

            // Emit custom event
            if (typeof document !== "undefined") {
                const event = new CustomEvent("navigate-to-item", {
                    bubbles: true,
                    detail: {
                        direction,
                        fromItemId: oldItemId,
                        toItemId: this.cursor.itemId,
                        cursorScreenX: 0, // Cursor X coordinate (specify 0 when moving between items)
                    },
                });
                document.dispatchEvent(event);
            }
        } else {
            // Update cursor state even if item did not change
            this.cursor.offset = newOffset;
            this.cursor.applyToStore();
            store.startCursorBlink();

            // Debug info
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Item not changed, updated offset: ${newOffset}`);
            }
        }
    }
}
