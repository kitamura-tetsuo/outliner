import type { Awareness } from "y-protocols/awareness";
import { YTree } from "yjs-orderedtree";
import { Item, Items, Project } from "../../schema/yjs-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function yCast<T = any>(obj: unknown): T {
    return obj as T;
}

function moveChildToParent(tree: YTree, itemKey: string, newParentKey: string): void {
    yCast(tree).moveChildToParent(itemKey, newParentKey);
}

function getStates(awareness: Awareness): Map<number, unknown> {
    return yCast<Map<number, unknown>>(awareness).getStates();
}

function getClientId(awareness: Awareness): number {
    return yCast<{ clientID: number; }>(awareness).clientID;
}

function onAwarenessChange(
    awareness: Awareness,
    handler: (changes: { added: Set<number>; updated: Set<number>; removed: Set<number>; }) => void,
): void {
    yCast(awareness).on("change", handler);
}

function offAwarenessChange(
    awareness: Awareness,
    handler: (changes: { added: Set<number>; updated: Set<number>; removed: Set<number>; }) => void,
): void {
    yCast(awareness).off("change", handler);
}
import { colorForUser } from "../../stores/colorForUser";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { presenceStore } from "../../stores/PresenceStore.svelte";

function childrenKeys(tree: YTree, parentKey: string): string[] {
    const children = tree.getNodeChildrenFromKey(parentKey);
    return tree.sortChildrenByOrder(children, parentKey);
}

function resolveOverlayStore(): typeof editorOverlayStore | undefined {
    return yCast<{ editorOverlayStore?: typeof editorOverlayStore; }>(globalThis).editorOverlayStore
        ?? editorOverlayStore;
}

function resolvePresenceStore(): typeof presenceStore | undefined {
    return yCast<{ presenceStore?: typeof presenceStore; }>(globalThis).presenceStore ?? presenceStore;
}

function resolveUserColor(userId: string, provided?: string): string {
    if (provided) return provided;
    const globalAny = yCast<{ colorForUser?: (id: string) => string; }>(globalThis);
    const globalColorForUser = globalAny.colorForUser as ((id: string) => string) | undefined;
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
    presence: { cursor?: { itemId: string; offset: number; }; selection?: unknown; } | null | undefined,
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
        const tree = project.tree;
        moveChildToParent(tree, itemKey, newParentKey);
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
        const tree = project.tree;
        const parent = tree.getNodeParentFromKey(itemKey);
        if (!parent) return;
        const siblings = childrenKeys(tree, parent);
        const idx = siblings.indexOf(itemKey);
        if (idx > 0) {
            const newParent = siblings[idx - 1];
            moveChildToParent(tree, itemKey, newParent);
            tree.setNodeOrderToEnd(itemKey);
        }
    },

    outdentItem(project: Project, itemKey: string) {
        const tree = project.tree;
        const parent = tree.getNodeParentFromKey(itemKey);
        if (!parent) return;
        const grand = tree.getNodeParentFromKey(parent);
        if (!grand) return;
        moveChildToParent(tree, itemKey, grand);
        tree.setNodeAfter(itemKey, parent);
    },

    reorderItem(project: Project, itemKey: string, index: number) {
        const tree = project.tree as YTree;
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

    setPresence(awareness: Awareness, state: { cursor?: unknown; selection?: unknown; } | null) {
        awareness.setLocalStateField("presence", state ?? null);
    },

    getPresence(awareness: Awareness) {
        return awareness.getLocalState()?.presence as {
            cursor?: { itemId: string; offset: number; };
            selection?: unknown;
        } | null;
    },

    bindProjectPresence(awareness: Awareness) {
        const update = (
            { added, updated, removed }: { added: Set<number>; updated: Set<number>; removed: Set<number>; },
        ) => {
            // Prefer the globally-registered store when running in the browser.
            const target = resolvePresenceStore();
            if (!target) return;
            const states = getStates(awareness);
            const clientId = getClientId(awareness);
            const overlay = resolveOverlayStore();

            [...added, ...updated].forEach((id: number) => {
                const s = states.get(id) as {
                    user?: { userId: string; name?: string; color?: string; };
                    presence?: unknown;
                } | undefined;
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
                const s = states.get(id) as { user?: { userId: string; name?: string; }; } | undefined;
                const user = s?.user;
                if (!user) return;
                target.removeUser(user.userId);

                if (overlay && id !== clientId) {
                    applyPresenceToOverlay(overlay, { ...user }, null);
                }
            });
        };
        onAwarenessChange(awareness, update);
        update({ added: new Set(getStates(awareness).keys()), updated: new Set(), removed: new Set() });
        return () => offAwarenessChange(awareness, update);
    },

    bindPagePresence(awareness: Awareness) {
        const update = (
            { added, updated, removed }: { added: Set<number>; updated: Set<number>; removed: Set<number>; },
        ) => {
            const overlay = resolveOverlayStore();
            if (!overlay) return; // no-op when overlay store not present
            const states = getStates(awareness);
            const clientId = getClientId(awareness);

            [...added, ...updated].forEach((id: number) => {
                const s = states.get(id) as { user?: unknown; presence?: unknown; } | undefined;
                const user = s?.user as { userId: string; name?: string; } | undefined;
                if (!user) return;
                if (id === clientId) return;
                applyPresenceToOverlay(overlay, user, s?.presence);
            });

            removed.forEach((id: number) => {
                const s = states.get(id) as { user?: unknown; } | undefined;
                const user = s?.user as { userId: string; name?: string; } | undefined;
                if (!user) return;
                if (id === clientId) return;
                applyPresenceToOverlay(overlay, user, null);
            });
        };
        onAwarenessChange(awareness, update);
        return () => offAwarenessChange(awareness, update);
    },
};

export type YjsService = typeof yjsService;
