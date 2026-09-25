// Pending structural Cut of Diagram-containing nodes (issue #5314, REQ-005,
// REQ-006, REQ-014).
//
// A Cut does not remove anything. It stages a single-use transfer that only
// this browser-tab/project session holds: the clipboard bytes merely name it,
// so a reload, another tab or a hand-written payload can never reconstruct the
// authority to move nodes. The record lives in module memory on purpose — no
// durable ledger, no history entry — and moves through three states:
//
//   pending  → consumed  (one successful Paste; never reactivated by Undo/Redo)
//   pending  → invalid   (structure changed, session ended, or replaced)
//
// Validity is structural. The staged selection is fingerprinted by the
// identities, parent edges and order positions of every selected node, of its
// whole subtree and of its source ancestry, plus each Diagram target. Every
// integrated change to the outline re-derives that fingerprint; the first
// mismatch invalidates the transfer for good, so a later return to the same
// visible position cannot revive it. Content-only edits (Text characters,
// Diagram source) leave the fingerprint alone and the transfer stays eligible.

import type { Project } from "$shared/app-schema";
import { v4 as uuid } from "uuid";
import type * as Y from "yjs";

export type PendingCutState = "pending" | "consumed" | "invalid";

interface PendingCut {
    id: string;
    doc: Y.Doc;
    project: Project;
    /** Keys of the selected root nodes, in document order. */
    rootKeys: string[];
    fingerprint: string;
    state: PendingCutState;
    stopObserving: () => void;
}

export type PendingCutLookup =
    | { ok: true; project: Project; rootKeys: string[]; }
    | { ok: false; reason: "unknown-transfer" | "already-consumed" | "stale-transfer"; };

/** Every transfer this session has issued, so a consumed one can say so. */
const transfers = new Map<string, PendingCut>();
/** The one transfer a new Copy/Cut in this editor replaces. */
let current: PendingCut | undefined;

/**
 * Whether the tree currently holds `key`. The installed `yjs-orderedtree`
 * exposes node membership only through its computed map.
 */
export function nodeExists(project: Project, key: string): boolean {
    const tree = project.tree as unknown as { hasNode?: (k: string) => boolean; computedMap?: Map<string, unknown>; };
    if (typeof tree.hasNode === "function") return tree.hasNode(key);
    return tree.computedMap?.has(key) ?? false;
}

interface TreeNodeMap {
    get(key: string): unknown;
}

function nodeMap(project: Project, key: string): Y.Map<unknown> | undefined {
    const node = (project.tree as unknown as { _ymap?: TreeNodeMap; })._ymap?.get(key);
    return node as Y.Map<unknown> | undefined;
}

/**
 * The current placement of one node: its parent edge and the order index it
 * holds under that parent. `yjs-orderedtree` bumps the edge counter on every
 * reparent, so a move away and back never reproduces an earlier value.
 */
function placementOf(project: Project, key: string): string {
    const parentKey = project.tree.getNodeParentFromKey(key);
    const history = nodeMap(project, key)?.get("_parentHistory") as Y.Map<unknown> | undefined;
    const edge = parentKey ? history?.get(parentKey) as { counter?: number; order?: string; } | undefined : undefined;
    return `${key}<${parentKey ?? ""}#${edge?.counter ?? ""}@${edge?.order ?? ""}`;
}

function targetOf(project: Project, key: string): string {
    try {
        const value = project.tree.getNodeValueFromKey(key) as Y.Map<unknown> | undefined;
        return `${String(value?.get?.("componentType") ?? "")}:${String(value?.get?.("diagramId") ?? "")}`;
    } catch {
        return "?";
    }
}

/**
 * Structural fingerprint of a staged selection, or undefined once any part of
 * it no longer exists. Order of children is part of the subtree placements.
 */
export function fingerprintSelection(project: Project, rootKeys: readonly string[]): string | undefined {
    const tree = project.tree;
    const parts: string[] = [];
    for (const rootKey of rootKeys) {
        if (!nodeExists(project, rootKey)) return undefined;
        // Source ancestry: a move of any ancestor relocates the selection too.
        const ancestry: string[] = [];
        for (let key: string | undefined = tree.getNodeParentFromKey(rootKey); key && key !== "root";) {
            if (!nodeExists(project, key)) return undefined;
            ancestry.push(placementOf(project, key));
            key = tree.getNodeParentFromKey(key);
        }
        parts.push(`^${ancestry.join(">")}`);
        const visit = (key: string) => {
            parts.push(`${placementOf(project, key)}=${targetOf(project, key)}`);
            const children = tree.sortChildrenByOrder(tree.getNodeChildrenFromKey(key), key);
            parts.push(`[${children.join(",")}]`);
            for (const child of children) visit(child);
        };
        visit(rootKey);
    }
    return parts.join("|");
}

function invalidate(transfer: PendingCut): void {
    if (transfer.state === "pending") transfer.state = "invalid";
    transfer.stopObserving();
    if (current === transfer) current = undefined;
}

/**
 * Stage a pending Cut of `rootKeys` (whole subtrees, in document order).
 * Replaces — and so invalidates — whatever transfer this editor held before.
 */
export function stagePendingCut(project: Project, rootKeys: readonly string[]): string | undefined {
    invalidatePendingCut();
    const fingerprint = fingerprintSelection(project, rootKeys);
    if (fingerprint === undefined || rootKeys.length === 0) return undefined;

    const treeMap = project.ydoc.getMap("orderedTree");
    const transfer: PendingCut = {
        id: uuid(),
        doc: project.ydoc,
        project,
        rootKeys: [...rootKeys],
        fingerprint,
        state: "pending",
        stopObserving: () => {},
    };
    const onChange = () => {
        if (transfer.state !== "pending") return;
        if (fingerprintSelection(project, transfer.rootKeys) !== transfer.fingerprint) invalidate(transfer);
    };
    const onDestroy = () => invalidate(transfer);
    treeMap.observeDeep(onChange);
    project.ydoc.on("destroy", onDestroy);
    transfer.stopObserving = () => {
        treeMap.unobserveDeep(onChange);
        project.ydoc.off("destroy", onDestroy);
    };
    transfers.set(transfer.id, transfer);
    current = transfer;
    return transfer.id;
}

/**
 * Resolve a Cut payload's transfer for `project` without consuming it. A
 * transfer from another project session is as unknown here as a forged one.
 */
export function lookupPendingCut(transferId: string, project: Project | undefined): PendingCutLookup {
    const transfer = transfers.get(transferId);
    if (!transfer || !project || transfer.doc !== project.ydoc) return { ok: false, reason: "unknown-transfer" };
    if (transfer.state === "consumed") return { ok: false, reason: "already-consumed" };
    if (transfer.state === "invalid") return { ok: false, reason: "stale-transfer" };
    // Re-derive rather than trust the observer alone: the check concerns the
    // state integrated in this session right now.
    if (fingerprintSelection(transfer.project, transfer.rootKeys) !== transfer.fingerprint) {
        invalidate(transfer);
        return { ok: false, reason: "stale-transfer" };
    }
    return { ok: true, project: transfer.project, rootKeys: [...transfer.rootKeys] };
}

/** Consume a transfer after its relocation committed. History never reverses this. */
export function consumePendingCut(transferId: string): void {
    const transfer = transfers.get(transferId);
    if (!transfer || transfer.state !== "pending") return;
    transfer.state = "consumed";
    transfer.stopObserving();
    if (current === transfer) current = undefined;
}

/**
 * End the editor's pending transfer without touching the document: a newer
 * Copy/Cut replaced it, or its project session ended. Its source placements
 * stay exactly where they are.
 */
export function invalidatePendingCut(): void {
    if (current) invalidate(current);
}

/** State of a transfer, for diagnostics and tests. */
export function pendingCutState(transferId: string): PendingCutState | undefined {
    return transfers.get(transferId)?.state;
}
