import { readFileSync, writeFileSync } from "fs";
const file = "client/src/lib/cursor/CursorNavigationUtils.ts";
let content = readFileSync(file, "utf8");

// When i=0, prevForChild should be \`node\`, EXCEPT if \`node\` is the very root we started the recursive search from (which usually represents the page and is not navigable).
// Let's ensure the recursive function correctly identifies whether node is the start root.
const newFindPrevious =
    `function findPreviousItemRecursive(node: Item, targetId: string, prevItem?: Item): Item | undefined {
    if (node.id === targetId) {
        return prevItem;
    }

    const children = collectChildren(node);
    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        let prevForChild;
        if (i > 0) {
            prevForChild = getDeepestDescendant(children[i - 1]);
        } else {
            // Check if node is the currentPage (the top root node)
            const isTopRoot = node.id === generalStore.currentPage?.id;
            prevForChild = isTopRoot ? undefined : node;
        }

        if (child.id === targetId) {
            return prevForChild;
        }

        const found = findPreviousItemRecursive(child, targetId, prevForChild);
        if (found) return found;
    }

    return undefined;
}`;

content = content.replace(/function findPreviousItemRecursive\([^\{]+\{[\s\S]*?\n\}\n/m, newFindPrevious + "\n");
writeFileSync(file, content);
