import { readFileSync, writeFileSync } from "fs";
const file = "client/src/lib/Cursor.ts";
let content = readFileSync(file, "utf8");

// Instead of the previous messy attempt, let's fix Cursor.ts to not navigate to the page root.
// Wait, is "root" the project level or what?
// Let's modify Cursor.ts to avoid going up if parent is the current page.

const replace = `        } else if (direction === "up") {
            let prevItem = findPreviousItem(this.itemId);
            // If no previous sibling, try to navigate to parent item for up direction
            // Note: item.parent returns Items (collection), not Item. We need to find the parent Item.
            if (!prevItem) {
                const currentTarget = this.findTarget();
                const parentCollection = currentTarget?.parent;
                // Get the parent Item by creating it from parentKey (skip "root" as it's the project level)
                // ALSO skip if parentKey is the current page id.
                const isCurrentPage = parentCollection && parentCollection.parentKey === generalStore.currentPage?.id;

                if (parentCollection && parentCollection.parentKey && parentCollection.parentKey !== "root" && !isCurrentPage) {
                    prevItem = new (currentTarget!.constructor as unknown as {
                        new(...args: unknown[]): import("../schema/yjs-schema").Item;
                    })(
                        currentTarget!.ydoc,
                        currentTarget!.tree,
                        parentCollection.parentKey,
                    );
                }
            }

            if (prevItem) {
                newItemId = prevItem.id;
`;

content = content.replace(/        \} else if \(direction === "up"\) \{[\s\S]*?newItemId = prevItem\.id;/m, replace);
writeFileSync(file, content);
