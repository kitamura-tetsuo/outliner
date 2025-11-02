import type { Awareness } from "y-protocols/awareness";
import { Item, Items, Project } from "../../schema/yjs-schema";
import { colorForUser } from "../../stores/colorForUser";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { presenceStore } from "../../stores/PresenceStore.svelte";

// @ts-nocheck
function childrenKeys(tree: any, parentKey: string): string[] {
    const children = tree.getNodeChildrenFromKey(parentKey);
    return tree.sortChildrenByOrder(children, parentKey);
}

function resolveOverlayStore(): typeof editorOverlayStore | undefined {
    return (globalThis as any).editorOverlayStore ?? editorOverlayStore;
}

function resolvePresenceStore(): typeof presenceStore | undefined {
    return (globalThis as any).presenceStore ?? presenceStore;
}

function resolveUserColor(userId: string, provided?: string): string {
    if (provided) return provided;
    const globalColorForUser = (globalThis as any).colorForUser as ((id: string) => string) | undefined;
    if (typeof globalColorForUser === "function") {
        try {
            return globalColorForUser(userId);
        } catch {}
    }
    return colorForUser(userId);
}

function applyPresenceToOverlay(
    overlay: typeof editorOverlayStore | undefined,
    user: { userId: string; name?: string; color?: string; },
    presence: { cursor?: { itemId: string; offset: number; }; selection?: any; } | null | undefined,
) {
    if (!overlay || !user) return;
    const color = resolveUserColor(user.userId, user.color);
    if (presence?.cursor) {
        overlay.setCursor({
            itemId: presence.cursor.itemId,
            offset: presence.cursor.offset,
            isActive: false,
            userId: user.userId,
            userName: user.name,
            color,
        });
    } else {
        overlay.clearCursorAndSelection(user.userId, false);
    }

    if (presence?.selection) {
        overlay.setSelection({
            startItemId: presence.selection.startItemId,
            startOffset: presence.selection.startOffset,
            endItemId: presence.selection.endItemId,
            endOffset: presence.selection.endOffset,
            isReversed: presence.selection.isReversed,
            isBoxSelection: presence.selection.isBoxSelection,
            boxSelectionRanges: presence.selection.boxSelectionRanges,
            userId: user.userId,
            userName: user.name,
            color,
        });
    } else {
        overlay.clearSelectionForUser(user.userId);
    }
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

    setPresence(awareness: Awareness, state: { cursor?: any; selection?: any; } | null) {
        awareness.setLocalStateField("presence", state ?? null);
    },

    getPresence(awareness: Awareness) {
        return awareness.getLocalState()?.presence as any;
    },

    bindProjectPresence(awareness: Awareness) {
        const update = ({ added, updated, removed }: any) => {
            // Prefer the globally-registered store when running in the browser.
            const target = resolvePresenceStore();
            if (!target) return;
            const states = (awareness as any).getStates();
            const clientId = (awareness as any).clientID;
            const overlay = resolveOverlayStore();

            [...added, ...updated].forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (!user) return;
                const color = resolveUserColor(user.userId, user.color);
                // テストが即時反映を期待しているため同期更新する
                target.setUser({ userId: user.userId, userName: user.name, color });

                if (overlay && id !== clientId) {
                    applyPresenceToOverlay(overlay, { ...user, color }, s?.presence);
                }
            });

            removed.forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (!user) return;
                target.removeUser(user.userId);

                if (overlay && id !== clientId) {
                    applyPresenceToOverlay(overlay, { ...user }, null);
                }
            });
        };
        (awareness as any).on("change", update);
        update({ added: Array.from((awareness as any).getStates().keys()), updated: [], removed: [] });
        return () => (awareness as any).off("change", update);
    },

    bindPagePresence(awareness: Awareness) {
        const update = ({ added, updated, removed }: any) => {
            const overlay = resolveOverlayStore();
            if (!overlay) return; // no-op when overlay store not present
            const states = (awareness as any).getStates();
            const clientId = (awareness as any).clientID;

            [...added, ...updated].forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (!user) return;
                if (id === clientId) return;
                applyPresenceToOverlay(overlay, user, s?.presence);
            });

            removed.forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (!user) return;
                if (id === clientId) return;
                applyPresenceToOverlay(overlay, user, null);
            });
        };
        (awareness as any).on("change", update);
        return () => (awareness as any).off("change", update);
    },
};

export type YjsService = typeof yjsService;
