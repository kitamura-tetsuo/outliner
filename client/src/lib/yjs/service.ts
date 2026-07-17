import type { Awareness } from "y-protocols/awareness";
import { YTree } from "yjs-orderedtree";
import { Item, Items, Project } from "../../schema/yjs-schema";
import { colorForUser } from "../../stores/colorForUser";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { presenceStore } from "../../stores/PresenceStore.svelte";
import { safeGetNodeParent } from "../../utils/treeUtils";
import { getLogger } from "../logger";

const logger = getLogger("yjs-service");

interface YTreeWithMove extends YTree {
    moveChildToParent(childKey: string, parentKey: string): void;
}

function childrenKeys(tree: YTree, parentKey: string): string[] {
    if (typeof tree.hasNode === "function" && !tree.hasNode(parentKey)) return [];
    try {
        const children = tree.getNodeChildrenFromKey(parentKey);
        return tree.sortChildrenByOrder(children, parentKey);
    } catch (e) {
        logger.warn({ parentKey, error: e }, "[service] childrenKeys error fetching children for parentKey");
        return [];
    }
}

function resolveOverlayStore(): typeof editorOverlayStore | undefined {
    return (globalThis as typeof globalThis & {
        editorOverlayStore?: typeof import("../../stores/EditorOverlayStore.svelte").editorOverlayStore;
    }).editorOverlayStore ?? editorOverlayStore;
}

function resolvePresenceStore(): typeof presenceStore | undefined {
    return (globalThis as typeof globalThis & {
        presenceStore?: typeof import("../../stores/PresenceStore.svelte").presenceStore;
    }).presenceStore ?? presenceStore;
}

function resolveUserColor(userId: string, provided?: string): string {
    if (provided) return provided;
    const globalColorForUser = (globalThis as typeof globalThis & { colorForUser?: (id: string) => string; })
        .colorForUser as ((id: string) => string) | undefined;
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
    presence:
        | {
            pageId?: string;
            cursor?: { itemId: string; offset: number; };
            selection?: import("../../stores/EditorOverlayStore.svelte").SelectionRange;
        }
        | null
        | undefined,
) {
    if (!overlay || !user) return;

    // Filter out presence that belongs to a different page
    const currentPage = (window as Window & typeof globalThis & {
        appStore?: { currentPage?: { id?: string; }; };
    }).appStore?.currentPage;

    // If we're not on any page, or the presence doesn't match the current page, clear it
    // NOTE: in tests, currentPage may not exist. Allow when presence.pageId is missing
    if (
        (currentPage?.id === undefined && presence?.pageId) || (presence?.pageId && presence.pageId !== currentPage?.id)
    ) {
        overlay.clearCursorAndSelection(user.userId, false);
        return;
    }

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
        return project.ydoc.transact(() => {
            const items = new Items(project.ydoc, project.tree, parentKey);
            return items.addNode(author, index);
        }, null);
    },

    moveItem(project: Project, itemKey: string, newParentKey: string, index?: number) {
        project.ydoc.transact(() => {
            const tree = project.tree as unknown as YTreeWithMove;
            tree.moveChildToParent(itemKey, newParentKey);

            // Recompute virtual tree mid-transaction to allow ordering methods to work
            if (
                typeof (tree as unknown as { recomputeParentsAndChildren?: () => void; }).recomputeParentsAndChildren
                    === "function"
            ) {
                (tree as unknown as { recomputeParentsAndChildren: () => void; }).recomputeParentsAndChildren();
            }

            if (index !== undefined) {
                const siblings = childrenKeys(tree, newParentKey).filter((k: string) => k !== itemKey);
                const clamped = Math.max(0, Math.min(index, siblings.length));
                if (clamped === 0 && siblings[0]) tree.setNodeBefore(itemKey, siblings[0]);
                else if (clamped >= siblings.length) tree.setNodeOrderToEnd(itemKey);
                else tree.setNodeAfter(itemKey, siblings[clamped - 1]);
            }
        }, null);
    },

    removeItem(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            project.tree.deleteNodeAndDescendants(itemKey);
        }, null);
    },

    indentItem(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            const tree = project.tree as unknown as YTreeWithMove;
            const parent = safeGetNodeParent(tree, itemKey);
            if (!parent) return;
            const siblings = childrenKeys(tree, parent);
            const idx = siblings.indexOf(itemKey);
            if (idx > 0) {
                const newParent = siblings[idx - 1];
                tree.moveChildToParent(itemKey, newParent);
                if (
                    typeof (tree as unknown as { recomputeParentsAndChildren?: () => void; })
                        .recomputeParentsAndChildren === "function"
                ) {
                    (tree as unknown as { recomputeParentsAndChildren: () => void; }).recomputeParentsAndChildren();
                }
                tree.setNodeOrderToEnd(itemKey);
            }
        }, null);
    },

    outdentItem(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            const tree = project.tree as unknown as YTreeWithMove;
            const parent = safeGetNodeParent(tree, itemKey);
            if (!parent) return;
            const grand = safeGetNodeParent(tree, parent);
            if (!grand) return;
            tree.moveChildToParent(itemKey, grand);
            if (
                typeof (tree as unknown as { recomputeParentsAndChildren?: () => void; }).recomputeParentsAndChildren
                    === "function"
            ) {
                (tree as unknown as { recomputeParentsAndChildren: () => void; }).recomputeParentsAndChildren();
            }
            tree.setNodeAfter(itemKey, parent);
        }, null);
    },

    reorderItem(project: Project, itemKey: string, index: number) {
        project.ydoc.transact(() => {
            const tree = project.tree;
            const parent = safeGetNodeParent(tree, itemKey);
            if (!parent) return;
            const siblings = childrenKeys(tree, parent).filter((k: string) => k !== itemKey);
            const clamped = Math.max(0, Math.min(index, siblings.length));
            if (clamped === 0 && siblings[0]) tree.setNodeBefore(itemKey, siblings[0]);
            else if (clamped >= siblings.length) tree.setNodeOrderToEnd(itemKey);
            else tree.setNodeAfter(itemKey, siblings[clamped - 1]);
        }, null);
    },

    updateText(project: Project, itemKey: string, text: string) {
        const item = new Item(project.ydoc, project.tree, itemKey);
        item.updateText(text);
    },

    setPresence(
        awareness: Awareness,
        state: {
            cursor?: Omit<import("../../stores/EditorOverlayStore.svelte").CursorPosition, "cursorId" | "isActive"> & {
                cursorId?: string;
                isActive?: boolean;
            };
            selection?: import("../../stores/EditorOverlayStore.svelte").SelectionRange;
        } | null,
    ) {
        awareness.setLocalStateField("presence", state ?? null);
    },

    getPresence(awareness: Awareness) {
        return awareness.getLocalState()?.presence as {
            cursor?: Omit<import("../../stores/EditorOverlayStore.svelte").CursorPosition, "cursorId" | "isActive"> & {
                cursorId?: string;
                isActive?: boolean;
            };
            selection?: import("../../stores/EditorOverlayStore.svelte").SelectionRange;
        } | undefined;
    },

    bindProjectPresence(awareness: Awareness) {
        const clientUserMap = new Map<number, { userId: string; name?: string; color?: string; }>();
        const update = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[]; }) => {
            // Prefer the globally-registered store when running in the browser.
            const target = resolvePresenceStore();
            if (!target) return;
            const states = awareness.getStates();
            const clientId = (awareness as Awareness & { clientID: number; }).clientID;
            const overlay = resolveOverlayStore();

            [...added, ...updated].forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (!user) return;
                clientUserMap.set(id, user);
                const color = resolveUserColor(user.userId, user.color);
                // Update synchronously because tests expect immediate reflection.
                target.setUser({ userId: user.userId, userName: user.name, color });

                if (overlay && id !== clientId) {
                    applyPresenceToOverlay(overlay, { ...user, color }, s?.presence);
                }
            });

            removed.forEach((id: number) => {
                const user = clientUserMap.get(id);
                if (!user) return;
                clientUserMap.delete(id);
                target.removeUser(user.userId);

                if (overlay && id !== clientId) {
                    applyPresenceToOverlay(overlay, { ...user }, null);
                }
            });
        };
        awareness.on("change", update);
        update({ added: Array.from(awareness.getStates().keys()), updated: [], removed: [] });
        return () => awareness.off("change", update);
    },

    reapplyAllPresences(awareness: Awareness) {
        const overlay = resolveOverlayStore();
        if (!overlay) return;
        const states = awareness.getStates();
        const clientId = (awareness as Awareness & { clientID: number; }).clientID;

        states.forEach((s, id) => {
            const user = s?.user;
            if (!user) return;
            if (id === clientId) return;
            applyPresenceToOverlay(overlay, user, s?.presence);
        });
    },

    bindPagePresence(awareness: Awareness) {
        const clientUserMap = new Map<number, { userId: string; name?: string; color?: string; }>();
        const update = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[]; }) => {
            const overlay = resolveOverlayStore();
            if (!overlay) return; // no-op when overlay store not present
            const states = awareness.getStates();
            const clientId = (awareness as Awareness & { clientID: number; }).clientID;

            [...added, ...updated].forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (!user) return;
                clientUserMap.set(id, user);
                if (id === clientId) return;
                applyPresenceToOverlay(overlay, user, s?.presence);
            });

            removed.forEach((id: number) => {
                const user = clientUserMap.get(id);
                if (!user) return;
                clientUserMap.delete(id);
                if (id === clientId) return;
                applyPresenceToOverlay(overlay, user, null);
            });
        };
        awareness.on("change", update);
        return () => awareness.off("change", update);
    },

    promoteChildren(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            const tree = project.tree;
            const children = childrenKeys(tree, itemKey);
            if (children.length === 0) return;

            const parentKey = safeGetNodeParent(tree, itemKey);
            if (!parentKey) return;

            const siblings = childrenKeys(tree, parentKey);
            const itemIndex = siblings.indexOf(itemKey);

            children.forEach((childKey, i) => {
                yjsService.moveItem(project, childKey, parentKey, itemIndex + 1 + i);
            });
        }, null);
    },

    moveSubtreeUp(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            const tree = project.tree;
            const parentKey = safeGetNodeParent(tree, itemKey);
            if (!parentKey) return;
            const siblings = childrenKeys(tree, parentKey);
            const index = siblings.indexOf(itemKey);
            if (index > 0) {
                yjsService.moveItem(project, itemKey, parentKey, index - 1);
            }
        }, null);
    },

    moveSubtreeDown(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            const tree = project.tree;
            const parentKey = safeGetNodeParent(tree, itemKey);
            if (!parentKey) return;
            const siblings = childrenKeys(tree, parentKey);
            const index = siblings.indexOf(itemKey);
            if (index !== -1 && index < siblings.length - 1) {
                yjsService.moveItem(project, itemKey, parentKey, index + 1);
            }
        }, null);
    },

    moveItemUp(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            yjsService.promoteChildren(project, itemKey);
            yjsService.moveSubtreeUp(project, itemKey);
        }, null);
    },

    moveItemDown(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            yjsService.promoteChildren(project, itemKey);
            yjsService.moveSubtreeDown(project, itemKey);
        }, null);
    },
};

export type YjsService = typeof yjsService;
