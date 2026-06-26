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
            return findNextAtParentLevel(path);
        }

        const found = findNextItemRecursive(child, targetId, currentPath);
        if (found) return found;
    }

    return undefined;
}

function findNextAtParentLevel(path: Item[]): Item | undefined {
    // Go back up the tree to find a parent with a next sibling
    for (let i = path.length - 1; i >= 0; i--) {
        const currentAncestor = path[i];

        // If i === 0, we're at the root level and can't go higher
        if (i === 0) {
            return undefined;
        }

        // Get the parent (previous item in path)
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

console.log("Testing Previous Item:");
console.log("Prev of grandchild1:", findPreviousItemRecursive(root, "grandchild1")?.id);
console.log("Prev of child2:", findPreviousItemRecursive(root, "child2")?.id);
console.log("Prev of root2:", findPreviousItemRecursive(root, "root2")?.id);

console.log("\nTesting Next Item:");
console.log("Next of child1:", findNextItemRecursive(root, "child1", [])?.id);
console.log("Next of grandchild1:", findNextItemRecursive(root, "grandchild1", [])?.id);
console.log("Next of root1:", findNextItemRecursive(root, "root1", [])?.id);
console.log("Next of child2:", findNextItemRecursive(root, "child2", [])?.id);
