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
    private cursor: Cursor; // Holds the instance of the Cursor class

    constructor(cursor: Cursor) {
        this.cursor = cursor;
    }

    /**
     * Move the cursor to the left
     */
    moveLeft() {
        // Reset the initial column position as this is not an up/down key operation
        this.cursor.resetInitialColumn();

        const target = this.cursor.findTarget();
        if (!target) return;

        if (this.cursor.offset > 0) {
            this.cursor.offset = Math.max(0, this.cursor.offset - 1);
            this.cursor.applyToStore();

            // Ensure the cursor has been updated correctly
            store.startCursorBlink();
        } else {
            // Move to the previous item at the beginning of the line
            this.navigateToItem("left");
        }
    }

    /**
     * Move the cursor to the right
     */
    moveRight() {
        // Reset the initial column position as this is not an up/down key operation
        this.cursor.resetInitialColumn();

        const target = this.cursor.findTarget();
        const text = target?.text ?? "";

        // Increase offset only if text is not empty
        if (text.length > 0 && this.cursor.offset < text.length) {
            this.cursor.offset = this.cursor.offset + 1;
            this.cursor.applyToStore();

            // Ensure the cursor has been updated correctly
            store.startCursorBlink();
        } else {
            // Move to the next item if at the end of the line or if text is empty
            this.navigateToItem("right");
        }
    }

    /**
     * Move the cursor up
     */
    moveUp() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`moveUp called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // Get visual line information
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

        // Calculate current column position (position within the visual line)
        const currentColumn = this.cursor.offset - lineStartOffset;

        // Set or update initial column position
        if (this.cursor.initialColumn === null) {
            this.cursor.initialColumn = currentColumn;
        }

        // Use the initial column position
        const targetColumn = this.cursor.initialColumn;

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex > 0) {
            // Move to the upper visual line within the same item
            const prevLineRange = this.cursor.getVisualLineOffsetRange(this.cursor.itemId, lineIndex - 1);
            if (prevLineRange) {
                const prevLineLength = prevLineRange.endOffset - prevLineRange.startOffset;
                // Move to the initial column position or the end of the line, whichever is shorter
                this.cursor.offset = prevLineRange.startOffset + Math.min(targetColumn, prevLineLength);
                this.cursor.applyToStore();

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moved to previous visual line in same item: offset=${this.cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blink
                store.startCursorBlink();
            }
        } else {
            // Find the previous item
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                // Move to the last visual line of the previous item
                this.navigateToItem("up");

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moved to previous item: itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
                }
            } else {
                // If there is no previous item, move to the beginning of the same item
                if (this.cursor.offset > 0) {
                    this.cursor.offset = 0;
                    this.cursor.applyToStore();

                    // Ensure the cursor has been updated correctly
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
     * Move the cursor down
     */
    moveDown() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`moveDown called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // Get visual line information
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

        // Calculate current column position (position within the visual line)
        const currentColumn = this.cursor.offset - lineStartOffset;

        // Set or update initial column position
        if (this.cursor.initialColumn === null) {
            this.cursor.initialColumn = currentColumn;
        }

        // Use the initial column position
        const targetColumn = this.cursor.initialColumn;

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex < totalLines - 1) {
            // Move to the lower visual line within the same item
            const nextLineRange = this.cursor.getVisualLineOffsetRange(this.cursor.itemId, lineIndex + 1);
            if (nextLineRange) {
                const nextLineLength = nextLineRange.endOffset - nextLineRange.startOffset;
                // Move to the initial column position or the end of the line, whichever is shorter
                this.cursor.offset = nextLineRange.startOffset + Math.min(targetColumn, nextLineLength);
                this.cursor.applyToStore();

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moved to next visual line in same item: offset=${this.cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blink
                store.startCursorBlink();
            }
        } else {
            // Find the next item
            const nextItem = this.cursor.findNextItem();
            if (nextItem) {
                // Move to the first visual line of the next item
                this.navigateToItem("down");

                // Debug info
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moved to next item: itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
                }
            } else {
                // If there is no next item, move to the end of the same item
                const text = (target.text && typeof target.text.toString === "function") ? target.text.toString() : "";
                if (this.cursor.offset < text.length) {
                    this.cursor.offset = text.length;
                    this.cursor.applyToStore();

                    // Ensure the cursor has been updated correctly
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
     * Move between items
     * @param direction Direction of movement
     */
    navigateToItem(direction: "left" | "right" | "up" | "down") {
        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(
                `navigateToItem called with direction=${direction}, itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`,
            );
        }

        // Only update the store for item movement, let the component handle the event
        const oldItemId = this.cursor.itemId;
        let newItemId = this.cursor.itemId; // Default is current item
        let newOffset = this.cursor.offset; // Default is current offset
        let itemChanged = false;

        // Get the text of the current item
        const currentTarget = this.cursor.findTarget();
        const currentText = (currentTarget?.text && typeof currentTarget.text.toString === "function")
            ? currentTarget.text.toString()
            : "";
        const currentColumn = this.cursor.getCurrentColumn(currentText, this.cursor.offset);

        // Debug info
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`Current column: ${currentColumn}, current text: "${currentText}"`);
        }

        // Process item movement
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
                // If there is no previous item, move to the beginning of the same item
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
                // If there is no next item, move to the end of the same item
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

                // Calculate the position with the smallest change in x-coordinate
                // Select the position closest to the initial column position or the current column position
                // Do not exceed the length of the last line of the previous item
                const targetColumn = Math.min(
                    this.cursor.initialColumn !== null ? this.cursor.initialColumn : currentColumn,
                    lastLineLength,
                );
                newOffset = lastLineStart + targetColumn;

                // Special case: If the current cursor is at the beginning of the line (offset 0),
                // move to the beginning of the last line of the previous item
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
                // If there is no previous item, move to the beginning of the same item
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

                // Calculate the position with the smallest change in x-coordinate
                // Select the position closest to the initial column position or the current column position
                // Do not exceed the length of the first line of the next item
                const targetColumn = Math.min(
                    this.cursor.initialColumn !== null ? this.cursor.initialColumn : currentColumn,
                    firstLineLength,
                );
                newOffset = firstLineStart + targetColumn;

                // Special case: If the current cursor is at the end of the line (offset is text length),
                // move to the end of the first line of the next item
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
                // If there is no next item, move to the end of the same item
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

        // Execute only if the item has changed
        if (itemChanged) {
            // Debug info
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Item changed: oldItemId=${oldItemId}, newItemId=${newItemId}, newOffset=${newOffset}`);
            }

            // Ensure the cursor on the old item is removed before moving
            store.clearCursorForItem(oldItemId);

            // Remove other cursors of the same user (maintain single cursor mode)
            // Note: Clear only the cursors of the same user, not all cursors
            const cursorsToRemove = Object.values(store.cursors)
                .filter(c => c.userId === this.cursor.userId && c.cursorId !== this.cursor.cursorId)
                .map(c => c.cursorId);

            // Debug info
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Removing cursors: ${cursorsToRemove.join(", ")}`);
            }

            // Clear the selection
            this.cursor.clearSelection();

            // Remove existing cursors on the target item as well (prevent duplication)
            // Note: Remove only the cursors of the same user
            const cursorsInTargetItem = Object.values(store.cursors)
                .filter(c => c.itemId === newItemId && c.userId === this.cursor.userId)
                .map(c => c.cursorId);

            // Debug info
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Removing cursors in target item: ${cursorsInTargetItem.join(", ")}`);
            }

            // Set the new item and offset
            this.cursor.itemId = newItemId;
            this.cursor.offset = newOffset;

            // Update the active item
            store.setActiveItem(this.cursor.itemId);

            // Create a new cursor
            const cursorId = store.setCursor({
                itemId: this.cursor.itemId,
                offset: this.cursor.offset,
                isActive: true,
                userId: this.cursor.userId,
            });

            // Update cursorId
            this.cursor.cursorId = cursorId;

            // Start cursor blink
            store.startCursorBlink();

            // Dispatch a custom event
            if (typeof document !== "undefined") {
                const event = new CustomEvent("navigate-to-item", {
                    bubbles: true,
                    detail: {
                        direction,
                        fromItemId: oldItemId,
                        toItemId: this.cursor.itemId,
                        cursorScreenX: 0, // X-coordinate of the cursor (0 for item movement)
                    },
                });
                document.dispatchEvent(event);
            }
        } else {
            // Update the cursor state even if the item has not changed
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
