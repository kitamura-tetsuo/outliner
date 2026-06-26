import { readFileSync, writeFileSync } from "fs";
const file = "client/src/lib/cursor/CursorNavigationUtils.ts";
let content = readFileSync(file, "utf8");

const newFindPrevious =
    `function findPreviousItemRecursive(node: Item, targetId: string, prevItem?: Item): Item | undefined {
    if (node.id === targetId) {
        return prevItem;
    }

    const children = collectChildren(node);
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        // When target is the first child (i === 0), the previous item should be the parent itself (node)
        // Except if node is the root Page node, in which case there's no navigable prevItem
        const isRoot = node.id === generalStore.currentPage?.id;
        const prevForChild = i > 0 ? getDeepestDescendant(children[i - 1]) : (isRoot ? undefined : node);

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
