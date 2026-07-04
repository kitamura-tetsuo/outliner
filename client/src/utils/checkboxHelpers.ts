import { getLogger } from "../lib/logger";
import type { Item } from "../schema/app-schema";

const logger = getLogger("checkboxHelpers");

export function updateParentCheckboxStatus(parentItem: Item) {
    if (!parentItem) return;
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

    if (hasCheckboxes) {
        const isParentChecked = parentText.startsWith("[x] ");
        if (allChecked && !isParentChecked) {
            parentItem.updateText("[x] " + parentText.substring(4));
        } else if (!allChecked && isParentChecked) {
            parentItem.updateText("[ ] " + parentText.substring(4));
        }

        // Recursively update grandparent
        const grandparentItems = parentItem.parent;
        if (grandparentItems && grandparentItems.parentKey && grandparentItems.parentKey !== "root") {
            const grandparentId = grandparentItems.parentKey;
            const ydoc = grandparentItems.ydoc;
            const tree = grandparentItems.tree;

            if (ydoc && tree && grandparentId) {
                try {
                    // Try to instantiate grandparent Item dynamically if needed
                    // For now, since Item is not exported everywhere easily without circular dep, we just use the schema
                    import("../schema/app-schema").then(({ Item }) => {
                        const grandparent = new Item(ydoc, tree, grandparentId);
                        updateParentCheckboxStatus(grandparent);
                    });
                } catch (e) {
                    logger.error(
                        { error: e instanceof Error ? e : new Error(String(e)) },
                        "Failed to update grandparent checkbox status",
                    );
                }
            }
        }
    }
}
