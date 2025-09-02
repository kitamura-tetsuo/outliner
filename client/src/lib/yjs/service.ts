type Awareness = {
    getLocalState(): any;
    setLocalStateField(field: string, value: any): void;
};
import { Item, Items, Project } from "../../schema/yjs-schema";

function childrenKeys(tree: any, parentKey: string): string[] {
    const children = tree.getNodeChildrenFromKey(parentKey);
    return tree.sortChildrenByOrder(children, parentKey);
}

export const yjsService = {
    createProject(title: string): Project {
        return Project.createInstance(title);
    },

    addItem(project: Project, parentKey: string, author: string, index?: number): Item {
        const items = new Items(project.ydoc, project.tree, parentKey);
        return items.addNode(author, index);
    },

    moveItem(project: Project, itemKey: string, newParentKey: string, index?: number) {
        const tree = project.tree as any;
        tree.moveChildToParent(itemKey, newParentKey);
        if (index !== undefined) {
            const siblings = childrenKeys(tree, newParentKey).filter((k: string) => k !== itemKey);
            const clamped = Math.max(0, Math.min(index, siblings.length));
            if (clamped === 0 && siblings[0]) tree.setNodeBefore(itemKey, siblings[0]);
            else if (clamped >= siblings.length) tree.setNodeOrderToEnd(itemKey);
            else tree.setNodeAfter(itemKey, siblings[clamped - 1]);
        }
    },

    removeItem(project: Project, itemKey: string) {
        project.tree.deleteNodeAndDescendants(itemKey);
    },

    indentItem(project: Project, itemKey: string) {
        const tree = project.tree as any;
        const parent = tree.getNodeParentFromKey(itemKey);
        if (!parent) return;
        const siblings = childrenKeys(tree, parent);
        const idx = siblings.indexOf(itemKey);
        if (idx > 0) {
            const newParent = siblings[idx - 1];
            tree.moveChildToParent(itemKey, newParent);
            tree.setNodeOrderToEnd(itemKey);
        }
    },

    outdentItem(project: Project, itemKey: string) {
        const tree = project.tree as any;
        const parent = tree.getNodeParentFromKey(itemKey);
        if (!parent) return;
        const grand = tree.getNodeParentFromKey(parent);
        if (!grand) return;
        tree.moveChildToParent(itemKey, grand);
        tree.setNodeAfter(itemKey, parent);
    },

    reorderItem(project: Project, itemKey: string, index: number) {
        const tree = project.tree as any;
        const parent = tree.getNodeParentFromKey(itemKey);
        if (!parent) return;
        const siblings = childrenKeys(tree, parent).filter((k: string) => k !== itemKey);
        const clamped = Math.max(0, Math.min(index, siblings.length));
        if (clamped === 0 && siblings[0]) tree.setNodeBefore(itemKey, siblings[0]);
        else if (clamped >= siblings.length) tree.setNodeOrderToEnd(itemKey);
        else tree.setNodeAfter(itemKey, siblings[clamped - 1]);
    },

    updateText(project: Project, itemKey: string, text: string) {
        const item = new Item(project.ydoc, project.tree, itemKey);
        item.updateText(text);
    },

    setPresence(awareness: Awareness, state: { cursor?: any; selection?: any; }) {
        awareness.setLocalStateField("presence", state);
    },

    getPresence(awareness: Awareness) {
        return awareness.getLocalState()?.presence as any;
    },
};

export type YjsService = typeof yjsService;
