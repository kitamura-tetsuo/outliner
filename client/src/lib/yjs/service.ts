import { canAcceptChild } from "$shared/services/outlineNodeKind";
import type { Awareness } from "y-protocols/awareness";
import { YTree } from "yjs-orderedtree";
import { Item, Items, Project } from "../../schema/yjs-schema";
import { colorForUser } from "../../stores/colorForUser";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { presenceStore } from "../../stores/PresenceStore.svelte";
import { store } from "../../stores/store.svelte";
import { updateParentCheckboxStatus } from "../../utils/checkboxHelpers";
import { safeGetNodeParent } from "../../utils/treeUtils";
import { getLogger } from "../logger";
import { parseSelectionEndpoint, type SelectionEndpoint } from "../selection/selectionEndpoints";

const logger = getLogger("yjs-service");

interface YTreeWithMove extends YTree {
    moveChildToParent(childKey: string, parentKey: string): void;
}

function recomputeTree(tree: YTree) {
    const t = tree as unknown as { recomputeParentsAndChildren?: () => void; };
    if (typeof t.recomputeParentsAndChildren === "function") {
        t.recomputeParentsAndChildren();
    }
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

/**
 * A remote peer's selection as it arrives over awareness - every field optional, because
 * every field is somebody else's data.
 */
interface RemoteSelectionPayload {
    start?: unknown;
    end?: unknown;
    startItemId?: unknown;
    startOffset?: unknown;
    endItemId?: unknown;
    endOffset?: unknown;
    isReversed?: boolean;
    isBoxSelection?: boolean;
    boxSelectionRanges?: Array<{ itemId: string; startOffset: number; endOffset: number; }>;
}

/**
 * Validate a remote selection into local endpoints, or return undefined (#5025).
 *
 * Presence is ephemeral state, so there is nothing to migrate: a payload this build cannot
 * read is dropped and the peer renders without a selection. Endpoints are preferred; the
 * flat text fields are read as a fallback so a peer that predates the model still shows up.
 */
function parseRemoteSelection(
    payload: RemoteSelectionPayload,
): { start: SelectionEndpoint; end: SelectionEndpoint; } | undefined {
    const start = parseSelectionEndpoint(payload.start)
        ?? parseSelectionEndpoint({ itemId: payload.startItemId, offset: payload.startOffset });
    const end = parseSelectionEndpoint(payload.end)
        ?? parseSelectionEndpoint({ itemId: payload.endItemId, offset: payload.endOffset });
    if (!start || !end) return undefined;
    return { start, end };
}

function applyPresenceToOverlay(
    overlay: typeof editorOverlayStore | undefined,
    user: { userId: string; name?: string; color?: string; },
    presence:
        | {
            pageId?: string;
            cursor?: { itemId: string; offset: number; };
            // Whatever a peer put on the wire: this build's endpoints, an older build's
            // flat text fields, or something neither. It is validated, never trusted.
            selection?: RemoteSelectionPayload;
        }
        | null
        | undefined,
) {
    if (!overlay || !user) return;

    // Filter out presence that belongs to a different page
    const currentPage = store.currentPage;

    // If we're not on any page, or the presence doesn't match the current page, clear it
    // NOTE: in tests, currentPage may not exist. Allow when presence.pageId is missing
    if (
        (currentPage?.id === undefined && presence?.pageId) || (presence?.pageId && presence.pageId !== currentPage?.id)
    ) {
        overlay.clearCursorAndSelection(user.userId, false);
        return;
    }

    const color = user.color || colorForUser(user.userId);
    if (presence?.cursor) {
        overlay.setCursor({
            itemId: presence.cursor.itemId,
            offset: Math.max(0, presence.cursor.offset),
            isActive: false,
            userId: user.userId,
            userName: user.name,
            color,
        });
    } else {
        overlay.clearCursorAndSelection(user.userId, false);
    }

    const remoteSelection = presence?.selection ? parseRemoteSelection(presence.selection) : undefined;
    if (remoteSelection) {
        overlay.setSelection({
            start: remoteSelection.start,
            end: remoteSelection.end,
            isReversed: presence?.selection?.isReversed,
            isBoxSelection: presence?.selection?.isBoxSelection,
            boxSelectionRanges: presence?.selection?.boxSelectionRanges,
            userId: user.userId,
            userName: user.name,
            color,
        });
    } else {
        overlay.clearSelectionForUser(user.userId);
    }
}

export const yjsService = {
    // Store weak references to bound awareness instances and their unbind functions
    _boundAwareness: new WeakMap<Awareness, () => void>(),

    createProject(title: string): Project {
        return Project.createInstance(title);
    },

    addItem(project: Project, parentKey: string, author: string, index?: number): Item {
        return project.ydoc.transact(() => {
            const items = new Items(project.ydoc, project.tree, parentKey);
            const item = items.addNode(author, index);
            if (parentKey && parentKey !== "root") {
                updateParentCheckboxStatus(new Item(project.ydoc, project.tree, parentKey));
            }
            return item;
        }, null);
    },

    moveItem(project: Project, itemKey: string, newParentKey: string, index?: number) {
        // Same node-kind rule as drop and indent (#5015): a move that would
        // parent content under a Grid/Calendar leaf, or non-visual content
        // under a Layout, is refused instead of silently reshaping the tree.
        if (
            newParentKey && newParentKey !== "root"
            && !canAcceptChild(
                new Item(project.ydoc, project.tree, newParentKey),
                new Item(project.ydoc, project.tree, itemKey),
            )
        ) {
            return;
        }
        project.ydoc.transact(() => {
            const oldParentKey = safeGetNodeParent(project.tree, itemKey);
            const tree = project.tree as unknown as YTreeWithMove;
            tree.moveChildToParent(itemKey, newParentKey);

            // Recompute virtual tree mid-transaction to allow ordering methods to work
            recomputeTree(tree);

            if (index !== undefined) {
                const siblings = childrenKeys(tree, newParentKey).filter((k: string) => k !== itemKey);
                const clamped = Math.max(0, Math.min(index, siblings.length));
                if (clamped === 0 && siblings[0]) tree.setNodeBefore(itemKey, siblings[0]);
                else if (clamped >= siblings.length) tree.setNodeOrderToEnd(itemKey);
                else tree.setNodeAfter(itemKey, siblings[clamped - 1]);
            }
            if (oldParentKey && oldParentKey !== "root") {
                updateParentCheckboxStatus(new Item(project.ydoc, project.tree, oldParentKey));
            }
            if (newParentKey && newParentKey !== "root") {
                updateParentCheckboxStatus(new Item(project.ydoc, project.tree, newParentKey));
            }
        }, null);
    },

    removeItem(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            const parentKey = safeGetNodeParent(project.tree, itemKey);
            project.tree.deleteNodeAndDescendants(itemKey);
            if (parentKey && parentKey !== "root") {
                updateParentCheckboxStatus(new Item(project.ydoc, project.tree, parentKey));
            }
        }, null);
    },

    indentItem(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            const tree = project.tree as unknown as YTreeWithMove;
            const parent = safeGetNodeParent(tree, itemKey);
            const oldParentKey = parent;
            if (!parent) return;
            const siblings = childrenKeys(tree, parent);
            const idx = siblings.indexOf(itemKey);
            if (idx > 0) {
                const newParent = siblings[idx - 1];
                // Indenting reparents under the preceding sibling, so the same
                // node-kind rule a drop obeys applies here (#5015): a Grid or
                // Calendar leaf takes no children, and a Layout takes only
                // visual blocks. A refused indent leaves the tree untouched.
                if (
                    !canAcceptChild(
                        new Item(project.ydoc, project.tree, newParent),
                        new Item(project.ydoc, project.tree, itemKey),
                    )
                ) {
                    return;
                }
                tree.moveChildToParent(itemKey, newParent);
                recomputeTree(tree);
                tree.setNodeOrderToEnd(itemKey);
                if (oldParentKey && oldParentKey !== "root") {
                    updateParentCheckboxStatus(new Item(project.ydoc, project.tree, oldParentKey));
                }
                if (newParent && newParent !== "root") {
                    updateParentCheckboxStatus(new Item(project.ydoc, project.tree, newParent));
                }
            }
        }, null);
    },

    outdentItem(project: Project, itemKey: string) {
        project.ydoc.transact(() => {
            const tree = project.tree as unknown as YTreeWithMove;
            const parent = safeGetNodeParent(tree, itemKey);
            const oldParentKey = parent;
            if (!parent) return;
            const grand = safeGetNodeParent(tree, parent);
            if (!grand) return;
            tree.moveChildToParent(itemKey, grand);
            recomputeTree(tree);
            tree.setNodeAfter(itemKey, parent);
            if (oldParentKey && oldParentKey !== "root") {
                updateParentCheckboxStatus(new Item(project.ydoc, project.tree, oldParentKey));
            }
            if (grand && grand !== "root") {
                updateParentCheckboxStatus(new Item(project.ydoc, project.tree, grand));
            }
        }, null);
    },

    reorderItem(project: Project, itemKey: string, index: number) {
        project.ydoc.transact(() => {
            const tree = project.tree;
            recomputeTree(tree);
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
        // If already bound, return the existing unbind function
        const existingUnbind = this._boundAwareness.get(awareness);
        if (existingUnbind) {
            return existingUnbind;
        }

        const clientUserMap = new Map<number, { userId: string; name?: string; color?: string; }>();
        const update = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[]; }) => {
            const target = presenceStore;
            if (!target) return;
            const states = awareness.getStates();
            const clientId = (awareness as Awareness & { clientID: number; }).clientID;
            const overlay = editorOverlayStore;

            [...added, ...updated].forEach((id: number) => {
                const s = states.get(id);
                const user = s?.user;
                if (!user) return;
                clientUserMap.set(id, user);
                const color = user.color || colorForUser(user.userId);
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

                const stillPresent = [...clientUserMap.values()].some(u => u.userId === user.userId);
                if (!stillPresent) {
                    target.removeUser(user.userId);

                    if (overlay && id !== clientId) {
                        applyPresenceToOverlay(overlay, { ...user }, null);
                    }
                }
            });
        };
        awareness.on("change", update);
        update({ added: Array.from(awareness.getStates().keys()), updated: [], removed: [] });

        const unbind = () => {
            awareness.off("change", update);
            this._boundAwareness.delete(awareness);
        };

        this._boundAwareness.set(awareness, unbind);
        return unbind;
    },

    reapplyAllPresences(awareness: Awareness) {
        const overlay = editorOverlayStore;
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
