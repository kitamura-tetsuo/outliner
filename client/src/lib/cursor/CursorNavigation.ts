import type { Item as AppItem } from "../../schema/app-schema";
import type { Item } from "../../schema/yjs-schema";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import { escapeId } from "../../utils/domUtils";
import { getLogger } from "../logger";
import { findNextItem, findPreviousItem, searchItem as searchYjsItem } from "./CursorNavigationUtils";
import {
    getCurrentColumn,
    getCurrentLineIndex,
    getLineEndOffset,
    getLineStartOffset,
    getVisualLineInfo,
    getVisualLineOffsetRange,
    resolveItemText,
} from "./CursorTextUtils";

const logger = getLogger("CursorNavigation");

function searchAppItem(root: AppItem, id: string): AppItem | undefined {
    return searchYjsItem(root as unknown as Item, id) as unknown as AppItem | undefined;
}

/**
 * Minimal surface `Cursor` needs to expose so `CursorNavigation` can drive
 * `moveLeft`/`moveRight`/`moveUp`/`moveDown`/`navigateToItem` on its behalf.
 * Mirrors the `CursorEditingContext` pattern used by `CursorEditor`.
 */
export interface CursorNavigationContext {
    itemId: string;
    offset: number;
    userId: string;
    cursorId: string;
    initialColumn: number | null;
    resetInitialColumn(): void;
    findTarget(): Item | undefined;
    applyToStore(): void;
}

/**
 * Collect all item IDs from the tree in traversal order.
 * Shared by `CursorNavigation.navigateToItem`'s DOM fallbacks and by
 * `Cursor.calculateIsReversed` (selection ordering), so it lives here as a
 * standalone, importable function rather than a private method.
 * @param node The starting node to collect from
 * @param ids Array to collect IDs into
 * @returns Array of item IDs in tree traversal order
 */
export function collectAllItemIds(node: AppItem, ids: string[]): string[] {
    if (node.id) {
        ids.push(node.id);
    }

    // Check if node has items that are iterable
    if (node.items && typeof (node.items as { length?: number; }).length === "number") {
        const items = node.items as { length: number; at: (i: number) => AppItem | undefined; };
        for (let i = 0; i < items.length; i++) {
            const child = items.at(i);
            if (child) {
                collectAllItemIds(child, ids);
            }
        }
    }

    return ids;
}

export class CursorNavigation {
    constructor(private readonly cursor: CursorNavigationContext) {}

    moveLeft() {
        // Reset initial column position as this is not an up/down key operation
        this.cursor.resetInitialColumn();

        const target = this.cursor.findTarget();
        if (!target) return;

        if (this.cursor.offset > 0) {
            this.cursor.offset = Math.max(0, this.cursor.offset - 1);
            this.cursor.applyToStore();

            // Ensure cursor is correctly updated
            store.startCursorBlink();
        } else {
            // Move to previous item at start of line
            this.navigateToItem("left");
        }
    }

    moveRight() {
        // Reset initial column position as this is not an up/down key operation
        this.cursor.resetInitialColumn();

        const target = this.cursor.findTarget();

        const text = resolveItemText(target);

        // If at or beyond the end of the current item, find next item directly in DOM
        if (text.length > 0 && this.cursor.offset >= text.length) {
            // Try to find the next item directly in the DOM first
            if (typeof document !== "undefined") {
                const currentItemElement = document.querySelector(
                    `[data-item-id="${escapeId(this.cursor.itemId)}"]`,
                );
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

                        if (nextItemId && nextItemId !== this.cursor.itemId) {
                            // Set the new item and offset
                            this.cursor.itemId = nextItemId;
                            this.cursor.offset = 0;

                            // Update the store to reflect the changes
                            this.cursor.applyToStore();

                            // Start cursor blinking
                            store.startCursorBlink();

                            // Exit early since we've manually handled the navigation
                            return;
                        }
                    }
                }
            }

            // Fallback to navigateToItem if DOM approach didn't work
            this.navigateToItem("right");
        } else if (text.length > 0 && this.cursor.offset < text.length) {
            // Within the current item, just move the cursor right by one position
            this.cursor.offset = this.cursor.offset + 1;
            this.cursor.applyToStore();

            // Ensure cursor is correctly updated
            store.startCursorBlink();
        } else {
            // Empty text case - try to move to next item
            this.navigateToItem("right");
        }
    }

    moveUp() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`moveUp called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // Get visual line information
        const visualLineInfo = getVisualLineInfo(this.cursor.itemId, this.cursor.offset);

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // Fallback: Logical line processing (based on newline characters)

            const text = resolveItemText(target);
            const currentLineIndex = getCurrentLineIndex(text, this.cursor.offset);
            if (currentLineIndex > 0) {
                const prevLineStart = getLineStartOffset(text, currentLineIndex - 1);
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
            const prevLineRange = getVisualLineOffsetRange(this.cursor.itemId, lineIndex - 1);
            if (prevLineRange) {
                const prevLineLength = prevLineRange.endOffset - prevLineRange.startOffset;
                // Move to the initial column position or the line length, whichever is shorter
                this.cursor.offset = prevLineRange.startOffset + Math.min(targetColumn, prevLineLength);
                this.cursor.applyToStore();

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Moved to previous visual line in same item: offset=${this.cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blinking
                store.startCursorBlink();
            }
        } else {
            // Find the previous item
            const prevItem = findPreviousItem(this.cursor.itemId);
            // Also check for parent item when there's no previous sibling
            // Note: item.parent returns Items (collection), not Item. We need to find the parent Item.
            const currentTarget = this.cursor.findTarget();
            const parentCollection = currentTarget?.parent;
            // Get the parent Item by creating it from parentKey
            let parentItemInstance: AppItem | Item | null = null;
            if (!prevItem && parentCollection && parentCollection.parentKey && parentCollection.parentKey !== "root") {
                // Create the parent Item from the parentKey

                parentItemInstance = new (currentTarget!.constructor as unknown as {
                    new(ydoc: import("yjs").Doc, tree: import("yjs-orderedtree").YTree, key: string): Item;
                })(
                    currentTarget!.ydoc,
                    (currentTarget as unknown as { tree: import("yjs-orderedtree").YTree; }).tree,
                    parentCollection.parentKey,
                );
            }
            const hasParentToNavigateTo = !prevItem && parentItemInstance && parentItemInstance.id;

            if (prevItem || hasParentToNavigateTo) {
                // Move to previous item or parent item
                // navigateToItem("up") will handle both cases
                this.navigateToItem("up");

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(`Moved to previous item: itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
                }
            } else {
                // If there is no previous or parent item, move to the start of the same item
                if (this.cursor.offset > 0) {
                    this.cursor.offset = 0;
                    this.cursor.applyToStore();

                    // Ensure cursor is correctly updated
                    store.startCursorBlink();

                    // Debug information
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        logger.debug(`Moved to start of current item: offset=${this.cursor.offset}`);
                    }
                }
            }
        }
    }

    moveDown() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`moveDown called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // Get visual line information
        const visualLineInfo = getVisualLineInfo(this.cursor.itemId, this.cursor.offset);

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // Fallback: Logical line processing (based on newline characters)

            const text = resolveItemText(target);
            const lines = text.split("\n");
            const currentLineIndex = getCurrentLineIndex(text, this.cursor.offset);
            if (currentLineIndex < lines.length - 1) {
                const nextLineStart = getLineStartOffset(text, currentLineIndex + 1);
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
            const nextLineRange = getVisualLineOffsetRange(this.cursor.itemId, lineIndex + 1);
            if (nextLineRange) {
                const nextLineLength = nextLineRange.endOffset - nextLineRange.startOffset;
                // Move to the initial column position or the line length, whichever is shorter
                this.cursor.offset = nextLineRange.startOffset + Math.min(targetColumn, nextLineLength);
                this.cursor.applyToStore();

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Moved to next visual line in same item: offset=${this.cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blinking
                store.startCursorBlink();
            }
        } else {
            // Find the next item
            const nextItem = findNextItem(this.cursor.itemId);
            if (nextItem) {
                // Move to the first visual line of the next item
                this.navigateToItem("down");

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(`Moved to next item: itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
                }
            } else {
                // If there is no next item, move to the end of the same item

                const text = resolveItemText(target);
                if (this.cursor.offset < text.length) {
                    this.cursor.offset = text.length;
                    this.cursor.applyToStore();

                    // Ensure cursor is correctly updated
                    store.startCursorBlink();

                    // Debug information
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        logger.debug(`Moved to end of current item: offset=${this.cursor.offset}`);
                    }
                }
            }
        }
    }

    /**
     * Find the next item using DOM traversal as a fallback mechanism
     * @param currentItemId The ID of the current item
     * @returns The next item if found, otherwise undefined
     */
    private findNextItemViaDOM(currentItemId: string): AppItem | Item | undefined {
        if (typeof document === "undefined") return undefined;

        // Find the current element in the DOM
        const currentEl = document.querySelector(`[data-item-id="${escapeId(currentItemId)}"]`) as HTMLElement;
        if (!currentEl) return undefined;

        // Use TreeWalker for robust next item discovery
        const root = document.querySelector(".outliner") || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
            acceptNode(node) {
                return (node as Element).hasAttribute("data-item-id")
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_SKIP;
            },
        });
        walker.currentNode = currentEl;
        const nextEl = walker.nextNode() as HTMLElement | null;

        if (nextEl) {
            const nextItemId = nextEl.getAttribute("data-item-id");

            // Since we can't directly access the Item objects from the DOM,
            // we need to find it in the Yjs tree
            if (nextItemId) {
                const root = generalStore.currentPage as AppItem;
                if (root) {
                    const found = searchAppItem(root, nextItemId);
                    if (found) return found;
                }
            }
        }

        return undefined;
    }

    /**
     * Navigate between items
     * @param direction Direction of movement
     */
    navigateToItem(direction: "left" | "right" | "up" | "down") {
        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(
                `navigateToItem called with direction=${direction}, itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`,
            );
        }

        // Navigation to prev/next items only updates store; event emission is handled by component
        const oldItemId = this.cursor.itemId;
        let newItemId = this.cursor.itemId; // Default is current item
        let newOffset = this.cursor.offset; // Default is current offset
        let itemChanged = false;

        // Get text of current item
        const currentTarget = this.cursor.findTarget();

        const currentText = resolveItemText(currentTarget);
        const currentColumn = getCurrentColumn(currentText, this.cursor.offset);

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`Current column: ${currentColumn}, current text: "${currentText}"`);
        }

        // Handle item navigation
        if (direction === "left") {
            let prevItem = findPreviousItem(this.cursor.itemId);

            // DOM fallback: when tree lookup fails (e.g., first child under page title),
            // try to use the visual order to locate the previous item.
            if (!prevItem && typeof document !== "undefined") {
                const currentEl = document.querySelector(`[data-item-id="${escapeId(this.cursor.itemId)}"]`);
                if (currentEl) {
                    const root = document.querySelector(".outliner") || document.body;
                    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
                        acceptNode(node) {
                            return (node as Element).hasAttribute("data-item-id")
                                ? NodeFilter.FILTER_ACCEPT
                                : NodeFilter.FILTER_SKIP;
                        },
                    });
                    walker.currentNode = currentEl;
                    let prevEl = walker.previousNode() as HTMLElement | null;

                    // Walk backwards until we find a previous element that is not an ancestor
                    // of the current element.
                    while (prevEl && prevEl.contains(currentEl)) {
                        prevEl = walker.previousNode() as HTMLElement | null;
                    }

                    if (prevEl) {
                        const prevItemId = prevEl.getAttribute("data-item-id");
                        if (prevItemId && prevItemId !== this.cursor.itemId) {
                            const root = generalStore.currentPage as AppItem | undefined;
                            if (root) {
                                prevItem = searchAppItem(root, prevItemId) as unknown as Item;
                            }
                            newItemId = prevItemId;
                            const treeTextLength = prevItem
                                ? resolveItemText(prevItem).length
                                : undefined;
                            const domTextLength = prevEl.querySelector(".item-text")?.textContent?.length
                                ?? prevEl.textContent?.length
                                ?? 0;
                            newOffset = treeTextLength ?? domTextLength ?? 0;
                            itemChanged = true;
                        }
                    }
                }
            }

            if (prevItem && !itemChanged) {
                newItemId = prevItem.id;
                newOffset = prevItem.text?.length || 0;
                itemChanged = true;

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(`Moving left to previous item: id=${prevItem.id}, offset=${newOffset}`);
                }
            } else if (!itemChanged) {
                // If no previous item, move to the start of the same item
                const target = this.cursor.findTarget();
                if (target) {
                    newOffset = 0;

                    // Debug information
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        logger.debug(`No previous item, moving to start of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "right") {
            // Check if we're at the end of the current item
            const target = this.cursor.findTarget();

            const text = target ? resolveItemText(target) : "";
            const atEndOfCurrentItem = this.cursor.offset >= text.length;

            let nextItem = findNextItem(this.cursor.itemId);

            // If findNextItem failed, try to find the next item via DOM traversal as a fallback
            if (!nextItem) {
                nextItem = this.findNextItemViaDOM(this.cursor.itemId) as unknown as Item;
            }

            // If we're at the end of the current item and still don't have a next item,
            // try additional DOM-based approaches with broader selectors
            if (atEndOfCurrentItem && !nextItem) {
                // Try to find the next item via TreeWalker
                const currentEl = document.querySelector(`[data-item-id="${escapeId(this.cursor.itemId)}"]`);
                if (currentEl) {
                    const root = document.querySelector(".outliner") || document.body;
                    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
                        acceptNode(node) {
                            return (node as Element).hasAttribute("data-item-id")
                                ? NodeFilter.FILTER_ACCEPT
                                : NodeFilter.FILTER_SKIP;
                        },
                    });
                    walker.currentNode = currentEl;
                    const nextItemElement = walker.nextNode() as HTMLElement | null;

                    if (nextItemElement) {
                        const nextItemId = nextItemElement.getAttribute("data-item-id");
                        if (nextItemId) {
                            // Try to find this item in the Yjs tree
                            const root = generalStore.currentPage as AppItem;
                            if (root) {
                                nextItem = searchAppItem(root, nextItemId) as unknown as Item;
                            }
                        }
                    }
                }
            }

            if (nextItem) {
                newItemId = nextItem.id;
                newOffset = 0;
                itemChanged = true;

                // Debug information
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(`Moving right to next item: id=${nextItem.id}, offset=${newOffset}`);
                }
            } else if (atEndOfCurrentItem) {
                // DOM-based approach to find the next item by looking for visually adjacent elements
                try {
                    // Most direct approach: Find the element with the current item ID and get its next sibling
                    const currentItemElement = document.querySelector(
                        `[data-item-id="${escapeId(this.cursor.itemId)}"]`,
                    );

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
                        const nextItemElement = walker.nextNode() as HTMLElement | null;

                        if (nextItemElement) {
                            const nextItemId = nextItemElement.getAttribute("data-item-id");

                            if (nextItemId && nextItemId !== this.cursor.itemId) {
                                // Directly use the found next item ID
                                newItemId = nextItemId;
                                newOffset = 0; // Start at the beginning of the next item
                                itemChanged = true;

                                // Debug information
                                if (
                                    typeof window !== "undefined"
                                    && window.DEBUG_MODE
                                ) {
                                    logger.debug(
                                        `Moving right to next item (DOM direct lookup): id=${nextItemId}, offset=${newOffset}`,
                                    );
                                }
                            }
                        }
                    }
                } catch (e) {
                    logger.error({ error: e }, "Error in DOM-based next item lookup");
                }

                // If still not found, try a different approach by using a depth-first traversal of the tree
                if (!itemChanged) {
                    const root = generalStore.currentPage as AppItem;
                    if (root) {
                        const allItemIds = collectAllItemIds(root, []);
                        const currentIndex = allItemIds.indexOf(this.cursor.itemId);
                        if (currentIndex !== -1 && currentIndex < allItemIds.length - 1) {
                            const nextItemId = allItemIds[currentIndex + 1];
                            const nextItemFromTree = searchAppItem(root, nextItemId);
                            if (nextItemFromTree) {
                                newItemId = nextItemId;
                                newOffset = 0;
                                itemChanged = true;

                                if (
                                    typeof window !== "undefined"
                                    && window.DEBUG_MODE
                                ) {
                                    logger.debug(
                                        `Moving right to next item (tree fallback): id=${nextItemId}, offset=${newOffset}`,
                                    );
                                }
                            }
                        }
                    }
                }

                // FINAL ULTIMATE FALLBACK: If we still haven't found the next item,
                // let's try to get all items from the current page and find the next one in sequence
                if (!itemChanged) {
                    try {
                        const root = generalStore.currentPage as AppItem;
                        if (root) {
                            // Try a depth-first search to collect all items in proper order
                            const allItemsList: string[] = collectAllItemIds(root, []);

                            // Find current index and get the next item
                            const currentIndex = allItemsList.indexOf(this.cursor.itemId);
                            if (currentIndex !== -1 && currentIndex < allItemsList.length - 1) {
                                const nextItemId = allItemsList[currentIndex + 1];
                                newItemId = nextItemId;
                                newOffset = 0;
                                itemChanged = true;

                                if (
                                    typeof window !== "undefined"
                                    && window.DEBUG_MODE
                                ) {
                                    logger.debug(
                                        `Moving right to next item (breadth-first fallback): id=${nextItemId}, offset=${newOffset}`,
                                    );
                                }
                            }
                        }
                    } catch (e) {
                        logger.error({ error: e }, "Error in ultimate fallback");
                    }
                }

                // If itemChanged is still false after ALL attempts, we're at the end but couldn't find a next item
                // In this case, we should remain at the end of the current item, but still trigger the update
                if (!itemChanged) {
                    // Stay at the end of the current item but ensure we update the cursor state
                    // This case occurs when there is no next item available
                    newOffset = text.length;
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        logger.debug(
                            `No next item found after all attempts. Staying at end of current item: offset=${newOffset}`,
                        );
                    }
                }
            } else {
                // If we're not at the end of an item, just stay in the same item at end position
                const target = this.cursor.findTarget();
                if (target) {
                    newOffset = resolveItemText(target).length;

                    // Debug information
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        logger.debug(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "up") {
            const prevItem = findPreviousItem(this.cursor.itemId);

            // Additional logic to navigate to parent when there's no previous sibling
            const currentTarget = this.cursor.findTarget();
            const parentCollection = currentTarget?.parent as { parentKey?: string; } | undefined;
            let parentItemInstance: AppItem | Item | null = null;
            if (!prevItem && parentCollection && parentCollection.parentKey && parentCollection.parentKey !== "root") {
                try {
                    parentItemInstance = new (currentTarget!.constructor as unknown as {
                        new(ydoc: import("yjs").Doc, tree: import("yjs-orderedtree").YTree, key: string): Item;
                    })(
                        currentTarget!.ydoc,
                        (currentTarget as unknown as { tree: import("yjs-orderedtree").YTree; }).tree,
                        parentCollection.parentKey,
                    );
                } catch {}
            }
            const hasParentToNavigateTo = !prevItem && parentItemInstance && parentItemInstance.id;

            if (prevItem || hasParentToNavigateTo) {
                const targetPrevItem = prevItem || parentItemInstance!;
                newItemId = targetPrevItem.id;
                const prevText = (targetPrevItem.text && typeof targetPrevItem.text.toString === "function")
                    ? targetPrevItem.text.toString()
                    : "";
                const prevLines = prevText.split("\n");
                const lastLineIndex = prevLines.length - 1;
                const lastLineStart = getLineStartOffset(prevText, lastLineIndex);
                const lastLineEnd = getLineEndOffset(prevText, lastLineIndex);
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
                logger.debug(
                    `navigateToItem up - Moving to previous item's last line: itemId=${targetPrevItem.id}, offset=${newOffset}, targetColumn=${targetColumn}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}`,
                );
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(
                        `Moving up to previous item's last line: id=${targetPrevItem.id}, lastLineIndex=${lastLineIndex}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}`,
                    );
                }
            } else {
                // If there is no previous item, move to the beginning of the same item
                newOffset = 0;

                // Debug info
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`No previous item, moving to start of current item: offset=${newOffset}`);
                }
            }
        } else if (direction === "down") {
            let nextItem = findNextItem(this.cursor.itemId);

            // If findNextItem failed, try to find the next item via DOM traversal as a fallback
            if (!nextItem) {
                nextItem = this.findNextItemViaDOM(this.cursor.itemId) as unknown as Item;
            }

            if (nextItem) {
                newItemId = nextItem.id;

                const nextText = resolveItemText(nextItem);
                // const nextLines = nextText.split("\n");  // Not used
                const firstLineIndex = 0;
                const firstLineStart = getLineStartOffset(nextText, firstLineIndex);
                const firstLineEnd = getLineEndOffset(nextText, firstLineIndex);
                const firstLineLength = firstLineEnd - firstLineStart;

                // Calculate position with minimal x-coordinate change
                // Select position closest to initial or current column position
                // Ensure it does not exceed the length of the next item's first line
                const targetColumn = Math.min(
                    this.cursor.initialColumn !== null ? this.cursor.initialColumn : currentColumn,
                    firstLineLength,
                );
                newOffset = firstLineStart + targetColumn;

                // Special case: If current cursor is at the end of the line (offset is text length),
                // move to the end of the next item's first line
                const currentTarget = this.cursor.findTarget();

                const currentText = resolveItemText(currentTarget);
                if (this.cursor.offset === currentText.length) {
                    newOffset = firstLineEnd;
                }

                itemChanged = true;

                // Debug information
                logger.debug(
                    `navigateToItem down - Moving to next item's first line: itemId=${nextItem.id}, offset=${newOffset}, targetColumn=${targetColumn}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}`,
                );
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Moving down to next item's first line: id=${nextItem.id}, firstLineIndex=${firstLineIndex}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}`,
                    );
                }
            } else {
                // If there is no next item, move to the end of the same item
                const target = this.cursor.findTarget();
                if (target) {
                    newOffset = resolveItemText(target).length;

                    // Debug information
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        logger.debug(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        }

        // Execute only if the item has changed
        if (itemChanged) {
            // Debug information
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`Item changed: oldItemId=${oldItemId}, newItemId=${newItemId}, newOffset=${newOffset}`);
            }

            // Ensure old item's cursor is removed before moving
            store.clearCursorForItem(oldItemId);

            // Remove other cursors for the same user (maintain single cursor mode)
            // Note: Clear only cursors for the same user, not all cursors
            const cursorEntries = store.cursors ? Object.values(store.cursors) : [];
            const cursorsToRemove = cursorEntries
                .filter(c => c.userId === this.cursor.userId && c.cursorId !== this.cursor.cursorId)
                .map(c => c.cursorId);

            // Debug information
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`Removing cursors: ${cursorsToRemove.join(", ")}`);
            }

            // Clear selection
            store.clearSelectionForUser(this.cursor.userId);

            // Remove existing cursors in the target item (prevent duplication)
            // Note: Remove only cursors for the same user
            const cursorsInTargetItem = cursorEntries
                .filter(c => c.itemId === newItemId && c.userId === this.cursor.userId)
                .map(c => c.cursorId);

            // Debug information
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`Removing cursors in target item: ${cursorsInTargetItem.join(", ")}`);
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

            // Dispatch custom event
            if (typeof document !== "undefined") {
                const event = new CustomEvent("navigate-to-item", {
                    bubbles: true,
                    detail: {
                        direction,
                        fromItemId: oldItemId,
                        toItemId: this.cursor.itemId,
                        cursorScreenX: 0, // Cursor X coordinate (set to 0 during item navigation)
                    },
                });
                document.dispatchEvent(event);
            }
        } else {
            // Update cursor state even if item did not change
            this.cursor.offset = newOffset;
            this.cursor.applyToStore();
            store.startCursorBlink();

            // Debug information
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`Item not changed, updated offset: ${newOffset}`);
            }
        }
    }
}
