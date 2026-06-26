import { readFileSync, writeFileSync } from "fs";
const file = "client/src/lib/Cursor.ts";
let content = readFileSync(file, "utf8");

// We need to print `prevItem` in `navigateToItem("up")`
const replace = `        } else if (direction === "up") {
            let prevItem = findPreviousItem(this.itemId);
            // If no previous sibling, try to navigate to parent item for up direction
            // Note: item.parent returns Items (collection), not Item. We need to find the parent Item.
            if (!prevItem) {
                const currentTarget = this.findTarget();
                const parentCollection = currentTarget?.parent;
                // Get the parent Item by creating it from parentKey (skip "root" as it's the project level)
                if (parentCollection && parentCollection.parentKey && parentCollection.parentKey !== "root") {
                    prevItem = new (currentTarget!.constructor as unknown as {
                        new(...args: unknown[]): import("../schema/yjs-schema").Item;
                    })(
                        currentTarget!.ydoc,
                        currentTarget!.tree,
                        parentCollection.parentKey,
                    );
                }
            }

            console.log("navigateToItem UP: prevItem id:", prevItem?.id, "for current id:", this.itemId);

            if (prevItem) {
                // ... same as before
                newItemId = prevItem.id;
`;

content = content.replace(/        \} else if \(direction === "up"\) \{[\s\S]*?newItemId = prevItem.id;/m, replace);
writeFileSync(file, content);
