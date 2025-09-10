import type { Awareness } from "y-protocols/awareness";
import { Item, Items, Project } from "../../schema/yjs-schema";
import { colorForUser, presenceStore } from "../../stores/PresenceStore.svelte";

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

    bindProjectPresence(awareness: Awareness) {
        const update = ({ added, updated, removed }: any) => {
            // グローバルに登録されたストアがあればそれを使い、なければ直接importしたものを使う
            const target = (globalThis as any).presenceStore ?? presenceStore;
            const states = (awareness as any).getStates();
            [...added, ...updated].forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (!user) return;
                const color = user.color
                    || ((globalThis as any).colorForUser?.(user.userId) ?? colorForUser(user.userId));
                // テストが即時反映を期待しているため同期更新する
                target.setUser({ userId: user.userId, userName: user.name, color });
            });
            removed.forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (user) target.removeUser(user.userId);
            });
        };
        (awareness as any).on("change", update);
        update({ added: Array.from((awareness as any).getStates().keys()), updated: [], removed: [] });
        return () => (awareness as any).off("change", update);
    },

    bindPagePresence(awareness: Awareness) {
        const update = ({ added, updated, removed }: any) => {
            const overlay = (globalThis as any).editorOverlayStore;
            if (!overlay) return; // no-op when overlay store not present
            const states = (awareness as any).getStates();
            [...added, ...updated].forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                const p = s?.presence;
                if (!user || !p?.cursor) return;
                overlay.setCursor({
                    itemId: p.cursor.itemId,
                    offset: p.cursor.offset,
                    isActive: false,
                    userId: user.userId,
                    userName: user.name,
                    color: user.color || ((globalThis as any).colorForUser?.(user.userId) ?? "#888"),
                });
            });
            removed.forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (user) overlay.clearCursorAndSelection(user.userId, true);
            });
        };
        (awareness as any).on("change", update);
        return () => (awareness as any).off("change", update);
    },
};

export type YjsService = typeof yjsService;
