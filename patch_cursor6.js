import { readFileSync, writeFileSync } from "fs";
const file = "client/src/lib/Cursor.ts";
let content = readFileSync(file, "utf8");

// The issue might be findPreviousItem returning generalStore.currentPage instead of undefined
// because of how it is used in Cursor.ts

const newFindPreviousItemViaDOM = `
            const hasParentToNavigateTo = !prevItem && parentItemInstance && parentItemInstance.id;

            if (prevItem || hasParentToNavigateTo) {
                // IMPORTANT FIX: Avoid navigating to the page root node
                if (prevItem && prevItem.id === generalStore.currentPage?.id) {
                    // Do nothing, we're at the top root item
                    if (this.offset > 0) {
                        this.offset = 0;
                        this.applyToStore();
                        store.startCursorBlink();
                    }
                } else {
                    // Move to previous item or parent item
                    // navigateToItem("up") will handle both cases
                    this.navigateToItem("up");

                    // Debug information
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        logger.debug(\`Moved to previous item: itemId=\${this.itemId}, offset=\${this.offset}\`);
                    }
                }
            } else {
`;

// wait let me find where it sets prevItem
