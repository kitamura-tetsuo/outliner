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

        let prevForChild;
        if (i > 0) {
            prevForChild = getDeepestDescendant(children[i - 1]);
        } else {
            // Check if node is the currentPage (the top root node)
            const isTopRoot = node.id === "root";
            prevForChild = isTopRoot ? undefined : node;
        }

        if (child.id === targetId) {
            return prevForChild;
        }

        const found = findPreviousItemRecursive(child, targetId, prevForChild);
        if (found) return found;
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

console.log("Prev of root1:", findPreviousItemRecursive(root, "root1", undefined)?.id);
