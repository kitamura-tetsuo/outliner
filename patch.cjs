const fs = require('fs');

const path = 'client/src/lib/cursor/CursorEditor.ts';
let code = fs.readFileSync(path, 'utf8');

// The original block to replace
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

// Replace with cleaner code
const clean = `
                store.clearCursorAndSelection(cursor.userId);
`;

code = code.split(original).join(clean);
fs.writeFileSync(path, code);
console.log("Patched");
