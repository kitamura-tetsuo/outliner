
import type { Cursor } from "../Cursor";
import { store } from "../../stores/store.svelte";
import { getLogger } from "../logger";
const logger = getLogger();
import { Item as YjsItem } from "../../schema/app-schema";
import { findPreviousItem, findNextItem } from "./CursorNavigationUtils";
import { getVisualLineInfo, getVisualLineOffsetRange } from "./CursorTextUtils";
import { getCurrentLineIndex, getLineStartOffset, getLineEndOffset } from "./CursorTextUtils";

// We define an interface matching the internal state accessed by these functions
interface ICursorNavigation {
    itemId: string;
    offset: number;
    initialColumn: number | null;
    applyToStore(): void;
    navigateToItem(direction: "up" | "down" | "left" | "right"): void;
    resetInitialColumn(): void;
    findTarget(): any;
    getTargetText(target: any): string;
}


    export function moveUp(cursor: ICursorNavigation) {
        const target = cursor.findTarget();
        if (!target) return;

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`moveUp called for itemId=${cursor.itemId}, offset=${cursor.offset}`);
        }

        // Get visual line information
        const visualLineInfo = getVisualLineInfo(cursor.itemId, cursor.offset);

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // Fallback: Logical line processing (based on newline characters)

            const text = cursor.getTargetText(target);
            const currentLineIndex = getCurrentLineIndex(text, cursor.offset);
            if (currentLineIndex > 0) {
                const prevLineStart = getLineStartOffset(text, currentLineIndex - 1);
                cursor.offset = prevLineStart;
                cursor.applyToStore();

            } else {
                cursor.navigateToItem("up");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // Calculate current column position (position within visual line)
        const currentColumn = cursor.offset - lineStartOffset;

        // Set or update initial column position
        if (cursor.initialColumn === null) {
            cursor.initialColumn = currentColumn;
        }

        // Column position to use (initial column position)
        const targetColumn = cursor.initialColumn;

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex > 0) {
            // Move to the visual line above within the same item
            const prevLineRange = getVisualLineOffsetRange(cursor.itemId, lineIndex - 1);
            if (prevLineRange) {
                const prevLineLength = prevLineRange.endOffset - prevLineRange.startOffset;
                // Move to the initial column position or the line length, whichever is shorter
                cursor.offset = prevLineRange.startOffset + Math.min(targetColumn, prevLineLength);
                cursor.applyToStore();

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Moved to previous visual line in same item: offset=${cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blinking

            }
        } else {
            // Find the previous item
            const prevItem = findPreviousItem(cursor.itemId);
            // Also check for parent item when there's no previous sibling
            // Note: item.parent returns Items (collection), not Item. We need to find the parent Item.
            const currentTarget = cursor.findTarget() as any;
            const parentCollection = currentTarget?.parent;
            // Get the parent Item by creating it from parentKey
            let parentItemInstance: YjsItem | null = null;
            if (!prevItem && parentCollection && parentCollection.parentKey && parentCollection.parentKey !== "root") {
                // Create the parent Item from the parentKey

                parentItemInstance = new (currentTarget!.constructor as unknown as {
                    new(...args: unknown[]): YjsItem;
                })(
                    currentTarget!.ydoc,
                    currentTarget!.tree,
                    parentCollection.parentKey,
                );
            }
            const hasParentToNavigateTo = !prevItem && parentItemInstance && parentItemInstance.id;

            if (prevItem || hasParentToNavigateTo) {
                // Move to previous item or parent item
                // navigateToItem("up") will handle both cases
                cursor.navigateToItem("up");

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(`Moved to previous item: itemId=${cursor.itemId}, offset=${cursor.offset}`);
                }
            } else {
                // If there is no previous or parent item, move to the start of the same item
                if (cursor.offset > 0) {
                    cursor.offset = 0;
                    cursor.applyToStore();

                    // Ensure cursor is correctly updated


                    // Debug information
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        logger.debug(`Moved to start of current item: offset=${cursor.offset}`);
                    }
                }
            }
        }
    }


    export function moveDown(cursor: ICursorNavigation) {
        const target = cursor.findTarget();
        if (!target) return;

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`moveDown called for itemId=${cursor.itemId}, offset=${cursor.offset}`);
        }

        // Get visual line information
        const visualLineInfo = getVisualLineInfo(cursor.itemId, cursor.offset);

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // Fallback: Logical line processing (based on newline characters)

            const text = cursor.getTargetText(target);
            const lines = text.split("\n");
            const currentLineIndex = getCurrentLineIndex(text, cursor.offset);
            if (currentLineIndex < lines.length - 1) {
                const nextLineStart = getLineStartOffset(text, currentLineIndex + 1);
                cursor.offset = nextLineStart;
                cursor.applyToStore();

            } else {
                cursor.navigateToItem("down");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // Calculate current column position (position within visual line)
        const currentColumn = cursor.offset - lineStartOffset;

        // Set or update initial column position
        if (cursor.initialColumn === null) {
            cursor.initialColumn = currentColumn;
        }

        // Column position to use (initial column position)
        const targetColumn = cursor.initialColumn;

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex < totalLines - 1) {
            // Move to the visual line below within the same item
            const nextLineRange = getVisualLineOffsetRange(cursor.itemId, lineIndex + 1);
            if (nextLineRange) {
                const nextLineLength = nextLineRange.endOffset - nextLineRange.startOffset;
                // Move to the initial column position or the line length, whichever is shorter
                cursor.offset = nextLineRange.startOffset + Math.min(targetColumn, nextLineLength);
                cursor.applyToStore();

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Moved to next visual line in same item: offset=${cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blinking

            }
        } else {
            // Find the next item
            const nextItem = findNextItem(cursor.itemId);
            if (nextItem) {
                // Move to the first visual line of the next item
                cursor.navigateToItem("down");

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(`Moved to next item: itemId=${cursor.itemId}, offset=${cursor.offset}`);
                }
            } else {
                // If there is no next item, move to the end of the same item

                const text = cursor.getTargetText(target);
                if (cursor.offset < text.length) {
                    cursor.offset = text.length;
                    cursor.applyToStore();

                    // Ensure cursor is correctly updated


                    // Debug information
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        logger.debug(`Moved to end of current item: offset=${cursor.offset}`);
                    }
                }
            }
        }
    }


    export function moveLeft(cursor: ICursorNavigation) {
        // Reset initial column position as this is not an up/down key operation
        cursor.resetInitialColumn();

        const target = cursor.findTarget();
        if (!target) return;

        if (cursor.offset > 0) {
            cursor.offset = Math.max(0, cursor.offset - 1);
            cursor.applyToStore();

            // Ensure cursor is correctly updated

        } else {
            // Move to previous item at start of line
            cursor.navigateToItem("left");
        }
    }


    export function moveRight(cursor: ICursorNavigation) {
        // Reset initial column position as this is not an up/down key operation
        cursor.resetInitialColumn();

        const target = cursor.findTarget();

        const text = cursor.getTargetText(target);

        // If at or beyond the end of the current item, find next item directly in DOM
        if (text.length > 0 && cursor.offset >= text.length) {
            // Try to find the next item directly in the DOM first
            if (typeof document !== "undefined") {
                const currentItemElement = document.querySelector(`[data-item-id="${CSS.escape(cursor.itemId)}"]`);
                if (currentItemElement) {
                    const root = document.querySelector(".outliner") || document.body;
                    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
                        acceptNode(node) {
                            return (node as Element).hasAttribute("data-item-id")
                                ? NodeFilter.FILTER_ACCEPT
                                : NodeFilter.FILTER_SKIP;
                        },
                    });
                    walker.currentNode = currentItemElement;
                    const nextElement = walker.nextNode() as HTMLElement | null;

                    if (nextElement) {
                        const nextItemId = nextElement.getAttribute("data-item-id");

                        if (nextItemId && nextItemId !== cursor.itemId) {
                            // Set the new item and offset
                            cursor.itemId = nextItemId;
                            cursor.offset = 0;

                            // Update the store to reflect the changes
                            cursor.applyToStore();

                            // Start cursor blinking


                            // Exit early since we've manually handled the navigation
                            return;
                        }
                    }
                }
            }

            // Fallback to navigateToItem if DOM approach didn't work
            cursor.navigateToItem("right");
        } else if (text.length > 0 && cursor.offset < text.length) {
            // Within the current item, just move the cursor right by one position
            cursor.offset = cursor.offset + 1;
            cursor.applyToStore();

            // Ensure cursor is correctly updated

        } else {
            // Empty text case - try to move to next item
            cursor.navigateToItem("right");
        }
    }
