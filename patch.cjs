const fs = require("fs");

// Patch PageListItem.svelte (from PR branch)
const content = fs.readFileSync("client/src/components/PageListItem.svelte", "utf-8");
const newContent = content.replace(
    `        try {
            if (item.items) {
                let i = 0;
                for (const child of item.items) {
                    if (i++ > 10) break;
                    if (child) traverse(child, currentDepth + 1);
                    if (lines.length >= maxLines && image) return;
                    if (nodeCount >= maxNodes) return;
                }
            }
        } catch (e) {
            console.warn("Failed to iterate children", e);
        }
    }

    try {
        if (pageItem.items) {
            let i = 0;
            for (const child of pageItem.items) {
                if (i++ > 20) break;
                if (child) traverse(child, 1);
                if (lines.length >= maxLines && image) break;
            }
        }
    } catch (e) {
        console.warn("Failed to iterate root children", e);
    }`,
    `        try {
            if (item.items) {
                const len = item.items.length;
                for (let i = 0; i < len; i++) {
                    if (i > 10) break;
                    const child = item.items.at(i);
                    if (child) traverse(child, currentDepth + 1);
                    if (lines.length >= maxLines && image) return;
                    if (nodeCount >= maxNodes) return;
                }
            }
        } catch (e) {
            console.warn("Failed to iterate children", e);
        }
    }

    try {
        if (pageItem.items) {
            const len = pageItem.items.length;
            for (let i = 0; i < len; i++) {
                if (i > 20) break;
                const child = pageItem.items.at(i);
                if (child) traverse(child, 1);
                if (lines.length >= maxLines && image) break;
            }
        }
    } catch (e) {
        console.warn("Failed to iterate root children", e);
    }`,
);
fs.writeFileSync("client/src/components/PageListItem.svelte", newContent);

// Patch CursorEditor.ts (from main branch)
const path = "client/src/lib/cursor/CursorEditor.ts";
let code = fs.readFileSync(path, "utf8");

const original = `
                const oldItemId = cursor.itemId;
                const clearCursorAndSelection = (store as any).clearCursorAndSelection;
                if (typeof clearCursorAndSelection === "function") {
                    if (typeof clearCursorAndSelection.call === "function") {
                        clearCursorAndSelection.call(store, cursor.userId);
                    } else {
                        clearCursorAndSelection(cursor.userId);
                    }
                } else {
                    store.clearSelectionForUser?.(cursor.userId);
                    store.clearCursorForItem?.(oldItemId);
                }
`;

const clean = `
                store.clearCursorAndSelection(cursor.userId);
`;

code = code.split(original).join(clean);
fs.writeFileSync(path, code);
console.log("Patched");
