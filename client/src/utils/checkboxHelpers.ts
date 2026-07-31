import { Item } from "../schema/app-schema";

/**
 * Origin carried by the transactions that write rolled-up parent state. The tree
 * observer in `GeneralStore` skips transactions with this origin, so a roll-up
 * never triggers another roll-up pass.
 */
export const CHECKBOX_ROLLUP_ORIGIN = "checkbox-rollup";

/**
 * Recomputes `parentItem`'s checkbox state from its children and walks up the
 * ancestor chain. The whole walk runs inside a single Yjs transaction, so a
 * multi-level roll-up broadcasts one update and costs one undo step.
 */
export function updateParentCheckboxStatus(parentItem: Item) {
    if (!parentItem) return;

    parentItem.ydoc.transact(() => rollUp(parentItem), CHECKBOX_ROLLUP_ORIGIN);
}

function rollUp(parentItem: Item) {
    const parentText = String(parentItem.text);
    if (!parentText.startsWith("[ ] ") && !parentText.startsWith("[x] ")) return;

    let allChecked = true;
    let hasCheckboxes = false;

    // Check children
    const children = parentItem.items;

    // Explicitly iterate over children array
    const iter = "iterateUnordered" in children && typeof children.iterateUnordered === "function"
        ? children.iterateUnordered()
        : children;
    if (iter && typeof iter[Symbol.iterator] === "function") {
        for (const child of iter) {
            const childText = String(child.text);
            if (childText.startsWith("[ ] ")) {
                hasCheckboxes = true;
                allChecked = false;
                break;
            } else if (childText.startsWith("[x] ")) {
                hasCheckboxes = true;
            }
        }
    }

    if (!hasCheckboxes) return;

    const isParentChecked = parentText.startsWith("[x] ");
    if (allChecked && !isParentChecked) {
        parentItem.updateText("[x] " + parentText.substring(4));
    } else if (!allChecked && isParentChecked) {
        parentItem.updateText("[ ] " + parentText.substring(4));
    }

    // Recurse into the grandparent so the roll-up reaches the top of the branch.
    const grandparentItems = parentItem.parent;
    const grandparentId = grandparentItems?.parentKey;
    if (!grandparentId || grandparentId === "root") return;

    const ydoc = grandparentItems.ydoc;
    const tree = grandparentItems.tree;
    if (!ydoc || !tree) return;

    rollUp(new Item(ydoc, tree, grandparentId));
}
