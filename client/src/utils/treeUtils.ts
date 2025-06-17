import type { Item, Items, Project } from '../schema/app-schema';

export function findItemById(items: Items, itemId: string): Item | undefined {
    for (const item of items) {
        if (item.id === itemId) {
            return item;
        }
        if (item.items) {
            const found = findItemById(item.items as Items, itemId);
            if (found) return found;
        }
    }
    return undefined;
}

export function getItemPath(project: Project, itemId: string): { path: string[]; pageName: string } | undefined {
    const findPath = (current: Item, target: string, trail: string[]): string[] | null => {
        if (current.id === target) return trail;
        for (const child of current.items as Items) {
            const result = findPath(child, target, [...trail, child.text]);
            if (result) return result;
        }
        return null;
    };

    for (const pageItem of project.items as Items) {
        const path = findPath(pageItem, itemId, [pageItem.text]);
        if (path) {
            return { path, pageName: pageItem.text };
        }
    }
    return undefined;
}
