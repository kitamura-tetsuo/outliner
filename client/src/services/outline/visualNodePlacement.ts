/**
 * Where a newly created visual node goes (#5015).
 *
 * Slash-command creation *looks* like converting the item you are typing in,
 * but node kinds are immutable, so it is implemented as replacement:
 *
 * > an eligible empty Text node is removed and a freshly created visual node is
 * > inserted at the same tree position.
 *
 * "Eligible" is deliberately narrow — nothing here may destroy content. A node
 * that still holds user text, owns children, or is the page-title node is left
 * exactly as it is and the new node is inserted next to it instead.
 */

import { getLogger } from "../../lib/logger";
import type { Item } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";
import { insertItemAfterTargetOrAppend } from "../../utils/itemUtils";
import { isTextNode } from "./nodeTree";

const logger = getLogger("visualNodePlacement");

/** How a created node ended up in the tree — the caller reports it, tests assert it. */
export type VisualNodePlacement = "replaced" | "inserted-after";

export interface CreatedVisualNode {
    item: Item;
    placement: VisualNodePlacement;
}

/**
 * Whether `target` may be *discarded* to make room for a visual node.
 *
 * @param target The node the slash command was typed in.
 * @param remainingText That node's text once the command string is removed. It
 *   is passed in rather than read back, because the caller strips the command
 *   itself and the stripped value is what decides whether anything is lost.
 */
export function canReplaceWithVisualNode(target: Item | undefined, remainingText: string): boolean {
    if (!target) return false;
    // The page-title node names the page; replacing it would delete the page's
    // own row, so it is never eligible however empty it looks.
    if (target.id === generalStore.currentPage?.id) return false;
    if (!isTextNode(target)) return false;
    if (remainingText.trim().length > 0) return false;
    try {
        if (target.items.length > 0) return false;
    } catch (error) {
        logger.warn({ error }, "canReplaceWithVisualNode: unreadable children, refusing to replace");
        return false;
    }
    return true;
}

/**
 * Create a node of `componentType` at `target`'s position, replacing it when
 * that is safe and inserting after it otherwise.
 *
 * The replacement runs inside one Yjs transaction with the origin the project's
 * UndoManager tracks, so collaborators see a single structural change and one
 * Ctrl+Z puts the empty Text node back.
 */
export function createVisualNodeAtTarget(
    target: Item | undefined,
    remainingText: string,
    componentType: string,
    author: string,
): CreatedVisualNode | undefined {
    if (!canReplaceWithVisualNode(target, remainingText)) {
        const inserted = insertItemAfterTargetOrAppend(target, author);
        if (!inserted) return undefined;
        inserted.componentType = componentType;
        return { item: inserted, placement: "inserted-after" };
    }

    const replaced = target as Item;
    const parent = replaced.parent;
    const index = replaced.indexInParent();
    if (!parent || index === -1) {
        const inserted = insertItemAfterTargetOrAppend(target, author);
        if (!inserted) return undefined;
        inserted.componentType = componentType;
        return { item: inserted, placement: "inserted-after" };
    }

    let created: Item | undefined;
    const build = () => {
        // Inserting at the replaced node's own index and then deleting it
        // leaves the new node at exactly that sibling position, whatever else
        // the parent holds.
        created = parent.addNode(author, index);
        created.componentType = componentType;
        replaced.delete();
    };

    const doc = replaced.ydoc;
    if (typeof doc?.transact === "function") doc.transact(build, null);
    else build();

    if (!created) return undefined;
    return { item: created, placement: "replaced" };
}
