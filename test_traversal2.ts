interface Item {
    id: string;
    items?: Item[];
}

function collectChildren(node: Item): Item[] {
    return node.items || [];
}

function getDeepestDescendant(node: Item): Item {
    const children = collectChildren(node);
    if (children.length === 0) {
        return node;
    }
    return getDeepestDescendant(children[children.length - 1]);
}

function findPreviousItemRecursive(node: Item, targetId: string, prevItem?: Item): Item | undefined {
    if (node.id === targetId) {
        return prevItem;
    }

    const children = collectChildren(node);
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        // When target is the first child (i === 0), the previous item should be the parent itself (node)
        // NOT undefined (as it is in the current code)
        const prevForChild = i > 0 ? getDeepestDescendant(children[i - 1]) : node;

        if (child.id === targetId) {
            return prevForChild;
        }

        const found = findPreviousItemRecursive(child, targetId, prevForChild);
        if (found) return found;
    }

    return undefined;
}

function findNextItemRecursive(node: Item, targetId: string, path: Item[]): Item | undefined {
    // If the node itself is the target, its first child is the next item (if it has children)
    if (node.id === targetId) {
        const children = collectChildren(node);
        if (children.length > 0) return children[0];
    }

    const children = collectChildren(node);
    const currentPath = [...path, node];

    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (child.id === targetId) {
            // First rule of next item: if it has children, the next item is its first child
            const childChildren = collectChildren(child);
            if (childChildren.length > 0) {
                return childChildren[0];
            }

            // If it has no children, return the next sibling
            if (i < children.length - 1) {
                return children[i + 1];
            }
            // If no next sibling at this level, traverse upward to find next item
            return findNextAtParentLevel(currentPath); // Pass currentPath since it includes `node` (parent of child)
        }

        const found = findNextItemRecursive(child, targetId, currentPath);
        if (found) return found;
    }

    return undefined;
}

function findNextAtParentLevel(path: Item[]): Item | undefined {
    // path contains ancestors up to the parent of the node we're looking from
    // Go back up the tree to find a parent with a next sibling
    for (let i = path.length - 1; i > 0; i--) {
        const currentAncestor = path[i];
        const parent = path[i - 1];

        // Get siblings of currentAncestor (children of parent)
        const siblings = collectChildren(parent);
        const index = siblings.findIndex(item => item.id === currentAncestor.id);

        if (index !== -1 && index < siblings.length - 1) {
            // Return the next sibling
            return siblings[index + 1];
        }
        // If no more siblings at this level, continue up the tree
    }

    return undefined;
}

const root = {
    id: "root",
    items: [
        {
            id: "root1",
            items: [
                {
                    id: "child1",
                    items: [
                        { id: "grandchild1", items: [] },
                    ],
                },
                { id: "child2", items: [] },
            ],
        },
        { id: "root2", items: [] },
    ],
};

console.log("\nTesting Next Item:");
console.log("Next of root1 (expected child1):", findNextItemRecursive(root, "root1", [])?.id);
console.log("Next of child1 (expected grandchild1):", findNextItemRecursive(root, "child1", [])?.id);
console.log("Next of grandchild1 (expected child2):", findNextItemRecursive(root, "grandchild1", [])?.id);
console.log("Next of child2 (expected root2):", findNextItemRecursive(root, "child2", [])?.id);
console.log("Next of root2 (expected undefined):", findNextItemRecursive(root, "root2", [])?.id);
