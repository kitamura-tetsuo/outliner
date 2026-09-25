// Structural Copy/Cut/Paste of whole Diagram transclusions (issue #5314).
//
// Two deliberately separate transfers share one clipboard format:
//
// * Copy snapshots each referenced Diagram's format and source at copy time.
//   Pasting it allocates one fresh Diagram per original Diagram — shared by
//   every occurrence of that original within this one Paste — and fresh
//   occurrences referencing them. Each Paste allocates again.
// * Cut stages a pending, session-local transfer (diagramClipboardTransfer.ts)
//   and removes nothing. Pasting it relocates the live selected nodes, keeping
//   their identities, hierarchy and Diagram targets, and consumes the transfer.
//
// Every refusal happens before the first write: validation, authority and the
// destination are all checked up front, because a Yjs transaction cannot be
// cancelled once it has written. Diagram allocation is kept out of the outline
// history — only placements are one Undo/Redo command, replayed through the
// outline's native Yjs selective history — so history never deletes, recreates
// or resets a Diagram or its source.

import type { Project } from "$shared/app-schema";
import { canAcceptChild, DIAGRAM_COMPONENT_TYPE, type NodeKindLike } from "$shared/services/outlineNodeKind";
import { Item } from "../../schema/app-schema";
import { setItemCalendarId } from "../calendar/calendarBinding";
import { GRID_PASTE_PROGRESS_EVENT } from "../clipboard/gridPasteEvents";
import type { ClipboardItem, DiagramSnapshot, ItemClipboardPayloadV4 } from "../clipboard/itemClipboard";
import { invokingSurfaceWritable } from "../editorSurface";
import { getProjectCapabilities } from "../project/projectCapabilities";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { setItemGridId, setItemTableId } from "../yjstable/itemBinding";
import { canMutateDiagrams, canReadDiagrams, type DiagramAuthorization } from "./diagramAuthorization";
import { setItemDiagramId } from "./diagramBinding";
import { consumePendingCut, lookupPendingCut, nodeExists, stagePendingCut } from "./diagramClipboardTransfer";
import { readDiagram } from "./diagramQueries";
import { createDiagram, MERMAID_DIAGRAM_FORMAT } from "./diagramService";

/**
 * Transaction origin of duplicate Diagram allocation. No undo scope tracks it,
 * so allocating an object never becomes a history step of its own.
 */
export const DIAGRAM_CLIPBOARD_ALLOCATION_ORIGIN = { name: "diagram-clipboard-allocation" } as const;

export const DIAGRAM_CLIPBOARD_RESULT_EVENT = "diagram-clipboard-result";

export type DiagramClipboardFailureReason =
    | "capability-denied"
    | "snapshot-unavailable"
    | "unsupported-selection"
    | "unsupported-payload"
    | "cross-project"
    | "invalid-destination"
    | "source-editing-target"
    | "unknown-transfer"
    | "already-consumed"
    | "stale-transfer";

export type DiagramClipboardOperation = "copy" | "cut" | "paste" | "undo" | "redo";

export type DiagramClipboardResult =
    | {
        ok: true;
        operation: DiagramClipboardOperation;
        /** Pasted or moved root node ids, in document order. */
        itemIds?: string[];
        /** Diagrams a Copy-payload Paste allocated, keyed by original Diagram id. */
        diagramIdMap?: Record<string, string>;
        transferId?: string;
    }
    | { ok: false; operation: DiagramClipboardOperation; reason: DiagramClipboardFailureReason; };

const FAILURE_MESSAGES: Record<DiagramClipboardFailureReason, string> = {
    "capability-denied": "You do not have permission to change this page.",
    "snapshot-unavailable": "The Diagram could not be read, so nothing was copied.",
    "unsupported-selection": "Only whole items can be cut together with a Diagram.",
    "unsupported-payload": "The clipboard content cannot be pasted here.",
    "cross-project": "Diagrams can only be pasted within the project they belong to.",
    "invalid-destination": "The copied items cannot be placed here.",
    "source-editing-target": "Whole items cannot be pasted into Diagram source. Use plain-text paste instead.",
    "unknown-transfer": "This cut is no longer available. Cut the items again.",
    "already-consumed": "These items were already moved by an earlier paste.",
    "stale-transfer": "The cut items changed after they were cut. Cut them again.",
};

/**
 * Observable outcome of a Diagram clipboard command: a status message for the
 * user, plus a structured event that tests and other listeners can read.
 */
export function reportDiagramClipboardResult(result: DiagramClipboardResult): DiagramClipboardResult {
    if (typeof window === "undefined") return result;
    window.dispatchEvent(new CustomEvent(DIAGRAM_CLIPBOARD_RESULT_EVENT, { detail: result }));
    if (!result.ok) {
        window.dispatchEvent(
            new CustomEvent(GRID_PASTE_PROGRESS_EVENT, {
                detail: { state: "complete-with-data", report: [FAILURE_MESSAGES[result.reason]] },
            }),
        );
    }
    return result;
}

function fail(operation: DiagramClipboardOperation, reason: DiagramClipboardFailureReason): DiagramClipboardResult {
    return { ok: false, operation, reason };
}

/** Authority of the acting principal through the surface invoking the command. */
export function currentDiagramAuthorization(project: Project | undefined): DiagramAuthorization {
    return { capabilities: getProjectCapabilities(project), surfaceWritable: invokingSurfaceWritable() };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * Copy-time snapshots of the referenced Diagrams (REQ-002). Reading them is a
 * Diagram read and needs project read capability only; a Diagram that cannot
 * be read refuses the whole Copy rather than travel without its content.
 */
export function snapshotDiagramsForCopy(
    project: Project,
    diagramIds: readonly string[],
    auth: DiagramAuthorization,
): { ok: true; diagrams: Record<string, DiagramSnapshot>; } | { ok: false; reason: DiagramClipboardFailureReason; } {
    if (!canReadDiagrams(auth)) return { ok: false, reason: "capability-denied" };
    const diagrams: Record<string, DiagramSnapshot> = {};
    for (const diagramId of diagramIds) {
        if (diagrams[diagramId]) continue;
        const read = readDiagram(project, diagramId, auth);
        if (!read.ok) return { ok: false, reason: read.reason };
        if (!read.data) return { ok: false, reason: "snapshot-unavailable" };
        diagrams[diagramId] = { format: read.data.format, source: read.data.source };
    }
    return { ok: true, diagrams };
}

function childKeys(project: Project, key: string): string[] {
    return project.tree.sortChildrenByOrder(project.tree.getNodeChildrenFromKey(key), key);
}

function subtreeKeys(project: Project, key: string, into: string[] = []): string[] {
    into.push(key);
    for (const child of childKeys(project, key)) subtreeKeys(project, child, into);
    return into;
}

/**
 * The root nodes of a whole-node structural selection, in document order. A
 * pending Cut moves whole subtrees, so a selection that leaves out part of a
 * selected node's subtree — or includes the page's own title row — is not a
 * structural selection it can stage.
 */
export function structuralSelectionRoots(
    project: Project,
    selectedKeys: readonly string[],
    pageKey: string | undefined,
): string[] | undefined {
    const selected = new Set(selectedKeys);
    if (pageKey !== undefined && selected.has(pageKey)) return undefined;
    const roots = selectedKeys.filter(key => {
        const parentKey = project.tree.getNodeParentFromKey(key);
        return !parentKey || !selected.has(parentKey);
    });
    for (const root of roots) {
        if (!subtreeKeys(project, root).every(key => selected.has(key))) return undefined;
    }
    return roots;
}

/**
 * Stage a structural Cut (REQ-005, REQ-012). Starting it needs project write
 * capability and a writable source presentation, but it writes nothing.
 */
export function stageDiagramCut(
    project: Project,
    rootKeys: readonly string[],
    auth: DiagramAuthorization,
): { ok: true; transferId: string; } | { ok: false; reason: DiagramClipboardFailureReason; } {
    if (!canMutateDiagrams(auth)) return { ok: false, reason: "capability-denied" };
    const transferId = stagePendingCut(project, rootKeys);
    return transferId ? { ok: true, transferId } : { ok: false, reason: "unsupported-selection" };
}

// ---------------------------------------------------------------------------
// Paste
// ---------------------------------------------------------------------------

export interface DiagramPasteContext {
    project: Project;
    /** The page the paste is invoked on. */
    pageItem: Item;
    /** The row the caret is on; the run lands right after it. Undefined appends to the page. */
    anchor: Item | undefined;
    author: string;
    auth: DiagramAuthorization;
}

interface Destination {
    parentKey: string;
    /** Kind of the parent; undefined for the page root, which behaves like Text. */
    parentKind: NodeKindLike | undefined;
    /** Sibling the first placed node follows; undefined places it first (or appends when empty). */
    afterKey: string | undefined;
    /** True when there is no anchor and the run is appended at the end. */
    append: boolean;
}

function kindOfKey(project: Project, key: string): NodeKindLike {
    try {
        const value = project.tree.getNodeValueFromKey(key) as { get?: (k: string) => unknown; } | undefined;
        const componentType = value?.get?.("componentType");
        return { componentType: typeof componentType === "string" ? componentType : undefined };
    } catch {
        return { componentType: undefined };
    }
}

function isWithinPage(project: Project, key: string, pageKey: string): boolean {
    for (let current: string | undefined = key; current && current !== "root";) {
        if (current === pageKey) return true;
        current = project.tree.getNodeParentFromKey(current);
    }
    return false;
}

function resolveDestination(context: DiagramPasteContext): Destination | undefined {
    const { project, pageItem, anchor } = context;
    if (!nodeExists(project, pageItem.key)) return undefined;
    if (!anchor) return { parentKey: pageItem.key, parentKind: undefined, afterKey: undefined, append: true };
    if (anchor.key === pageItem.key) {
        // The title row stands outside the outline: the run starts the page.
        return { parentKey: pageItem.key, parentKind: undefined, afterKey: undefined, append: false };
    }
    // A caret left behind on another page anchors nothing here: append instead.
    if (!nodeExists(project, anchor.key) || !isWithinPage(project, anchor.key, pageItem.key)) {
        return { parentKey: pageItem.key, parentKind: undefined, afterKey: undefined, append: true };
    }
    const parentKey = project.tree.getNodeParentFromKey(anchor.key);
    if (!parentKey) return undefined;
    return {
        parentKey,
        parentKind: parentKey === pageItem.key ? undefined : kindOfKey(project, parentKey),
        afterKey: anchor.key,
        append: false,
    };
}

interface TreeOrdering {
    moveChildToParent(childKey: string, parentKey: string): void;
    recomputeParentsAndChildren(): void;
    setNodeAfter(nodeKey: string, target: string): void;
    setNodeBefore(nodeKey: string, target: string): void;
    setNodeOrderToEnd(nodeKey: string): void;
}

/** Order `key` (already a child of `parentKey`) right after `afterKey`, or first. */
function orderAt(project: Project, key: string, parentKey: string, afterKey: string | undefined, append: boolean) {
    const tree = project.tree as unknown as TreeOrdering;
    if (afterKey !== undefined) {
        tree.setNodeAfter(key, afterKey);
        return;
    }
    if (append) {
        tree.setNodeOrderToEnd(key);
        return;
    }
    const first = childKeys(project, parentKey).find(child => child !== key);
    if (first !== undefined) tree.setNodeBefore(key, first);
}

/** A clipboard item and the payload items directly beneath it. */
interface PasteNode {
    item: ClipboardItem;
    children: PasteNode[];
}

/**
 * The payload's hierarchy: each item is a child of the nearest preceding item
 * that is shallower. Items with no shallower predecessor are roots, placed as
 * consecutive siblings at the destination.
 */
function payloadForest(items: readonly ClipboardItem[]): PasteNode[] {
    const roots: PasteNode[] = [];
    const stack: PasteNode[] = [];
    for (const item of items) {
        const node: PasteNode = { item, children: [] };
        while (stack.length > 0 && stack[stack.length - 1].item.depth >= item.depth) stack.pop();
        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(node);
        else roots.push(node);
        stack.push(node);
    }
    return roots;
}

function forestIsValid(nodes: readonly PasteNode[], parentKind: NodeKindLike | undefined): boolean {
    return nodes.every(node =>
        canAcceptChild(parentKind, node.item)
        && forestIsValid(node.children, node.item)
    );
}

/**
 * Replay of a clipboard history command needs the same authority as the
 * Paste itself (REQ-012): checked before the router touches any history.
 */
function historyAuthorizer(project: Project): () => boolean {
    return () => {
        const allowed = canMutateDiagrams(currentDiagramAuthorization(project));
        if (!allowed) reportDiagramClipboardResult(fail("undo", "capability-denied"));
        return allowed;
    };
}

function checkCommon(
    payload: ItemClipboardPayloadV4,
    context: DiagramPasteContext,
): { destination: Destination; } | { reason: DiagramClipboardFailureReason; } {
    if (payload.sourceProjectId !== context.project.ydoc.guid) return { reason: "cross-project" };
    if (!canMutateDiagrams(context.auth)) return { reason: "capability-denied" };
    const destination = resolveDestination(context);
    if (!destination) return { reason: "invalid-destination" };
    return { destination };
}

function pasteCopy(payload: ItemClipboardPayloadV4, context: DiagramPasteContext): DiagramClipboardResult {
    const common = checkCommon(payload, context);
    if ("reason" in common) return fail("paste", common.reason);
    const { destination } = common;
    const { project } = context;

    const snapshots = payload.diagrams ?? {};
    for (const item of payload.items) {
        if (item.componentType !== DIAGRAM_COMPONENT_TYPE) continue;
        const snapshot = item.diagramId === undefined ? undefined : snapshots[item.diagramId];
        if (!snapshot || snapshot.format !== MERMAID_DIAGRAM_FORMAT) return fail("paste", "unsupported-payload");
    }
    const forest = payloadForest(payload.items);
    if (!forestIsValid(forest, destination.parentKind)) return fail("paste", "invalid-destination");

    // One original-to-duplicate map for this Paste only (REQ-003). Allocation
    // runs outside every undo scope, before and apart from the placements.
    const diagramIdMap: Record<string, string> = {};
    project.ydoc.transact(() => {
        for (const item of payload.items) {
            const originalId = item.diagramId;
            if (item.componentType !== DIAGRAM_COMPONENT_TYPE || originalId === undefined) continue;
            if (diagramIdMap[originalId]) continue;
            diagramIdMap[originalId] = createDiagram(project, { initialSource: snapshots[originalId].source });
        }
    }, DIAGRAM_CLIPBOARD_ALLOCATION_ORIGIN);

    const itemIds: string[] = [];
    const place = (node: PasteNode, parentKey: string): Item => {
        const created = new Item(project.ydoc, project.tree, parentKey).items.addNode(context.author);
        const { item } = node;
        if (item.componentType === undefined) {
            created.updateText(item.text);
        } else {
            created.componentType = item.componentType;
            if (item.componentType === DIAGRAM_COMPONENT_TYPE) {
                setItemDiagramId(created, diagramIdMap[item.diagramId as string]);
            } else if (item.componentType === "yjstable") {
                // Same-project Grid/Calendar policy is unchanged: another view.
                setItemGridId(created, item.yjsGridId);
                setItemTableId(created, item.yjsTableId);
            } else if (item.componentType === "calendar") {
                setItemCalendarId(created, item.calendarId);
            }
        }
        if (item.columnSpan !== undefined) created.columnSpan = item.columnSpan;
        for (const child of node.children) place(child, created.key);
        return created;
    };

    globalUndoRouter.captureCommand(() => {
        project.ydoc.transact(() => {
            let afterKey = destination.afterKey;
            for (const root of forest) {
                const created = place(root, destination.parentKey);
                orderAt(project, created.key, destination.parentKey, afterKey, destination.append);
                afterKey = created.key;
                itemIds.push(created.id);
            }
        });
    }, { authorize: historyAuthorizer(project) });

    return { ok: true, operation: "paste", itemIds, diagramIdMap };
}

function pasteCut(payload: ItemClipboardPayloadV4, context: DiagramPasteContext): DiagramClipboardResult {
    if (payload.sourceProjectId !== context.project.ydoc.guid) return fail("paste", "cross-project");
    // The transfer is resolved before anything else, so an unknown, stale or
    // consumed Cut is reported as such — and never degrades into a Copy.
    const transferId = payload.transferId as string;
    const transfer = lookupPendingCut(transferId, context.project);
    if (!transfer.ok) return fail("paste", transfer.reason);
    const common = checkCommon(payload, context);
    if ("reason" in common) return fail("paste", common.reason);
    const { destination } = common;
    const { project } = context;

    // A node may not move below itself or its own descendants, and the run
    // cannot be anchored on a node it is carrying along.
    const moving = new Set(transfer.rootKeys.flatMap(key => subtreeKeys(project, key)));
    if (moving.has(destination.parentKey) || (destination.afterKey && moving.has(destination.afterKey))) {
        return fail("paste", "invalid-destination");
    }
    if (!transfer.rootKeys.every(key => canAcceptChild(destination.parentKind, kindOfKey(project, key)))) {
        return fail("paste", "invalid-destination");
    }

    // Every check has passed and the move below is synchronous: consume first,
    // so the transfer's own structural observer never mistakes the committing
    // relocation for an intervening change.
    consumePendingCut(transferId);
    const tree = project.tree as unknown as TreeOrdering;
    globalUndoRouter.captureCommand(() => {
        project.ydoc.transact(() => {
            let afterKey = destination.afterKey;
            for (const key of transfer.rootKeys) {
                tree.moveChildToParent(key, destination.parentKey);
                tree.recomputeParentsAndChildren();
                orderAt(project, key, destination.parentKey, afterKey, destination.append);
                afterKey = key;
            }
        });
    }, { authorize: historyAuthorizer(project) });

    const itemIds = transfer.rootKeys.map(key => new Item(project.ydoc, project.tree, key).id);
    return { ok: true, operation: "paste", itemIds, transferId };
}

/**
 * Paste a Diagram-containing structural payload at the caret (REQ-002,
 * REQ-005..REQ-007, REQ-009). Returns — without reporting — the outcome.
 */
export function pasteDiagramPayload(
    payload: ItemClipboardPayloadV4,
    context: DiagramPasteContext,
): DiagramClipboardResult {
    return payload.operation === "cut" ? pasteCut(payload, context) : pasteCopy(payload, context);
}
