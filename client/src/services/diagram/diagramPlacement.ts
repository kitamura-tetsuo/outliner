/**
 * Where a Diagram transclusion is created or inserted (issue #5310, REQ-002,
 * REQ-003).
 *
 * Every function here checks authority and destination validity *before*
 * mutating anything, and orders its mutations so that the one fallible step —
 * "does this destination accept a Diagram child?" — always runs first and
 * unconditionally precedes creating a Diagram or an occurrence. Wrapping
 * writes in `Y.Doc.transact` is not itself rollback (Yjs transactions cannot
 * be cancelled), so nothing here relies on undoing a write: a rejected
 * command performs no write at all.
 */

import type { Project } from "$shared/app-schema";
import { DIAGRAM_COMPONENT_TYPE } from "$shared/services/outlineNodeKind";
import { canAcceptChild } from "$shared/services/outlineNodeKind";
import type { Item } from "../../schema/app-schema";
import { createVisualNodeAtTarget } from "../outline/visualNodePlacement";
import { canMutateDiagrams, type DiagramAuthorization } from "./diagramAuthorization";
import { setItemDiagramId } from "./diagramBinding";
import { createDiagram, diagramExists } from "./diagramService";

export type DiagramPlacementFailureReason =
    | "capability-denied"
    | "invalid-parent"
    | "parent-not-found"
    | "cross-project"
    | "diagram-not-found";

export interface DiagramPlacementFailure {
    ok: false;
    reason: DiagramPlacementFailureReason;
}

export interface DiagramPlacementSuccess {
    ok: true;
    itemId: string;
    diagramId: string;
}

export type DiagramPlacementResult = DiagramPlacementSuccess | DiagramPlacementFailure;

/**
 * Pure precondition check for an explicit-parent destination — no mutation.
 * `parent === undefined` means the page root, which (like Text) always
 * accepts a Diagram child. Shared by the "new" and "insert existing" paths.
 */
function checkParentDestination(
    project: Project,
    parent: Item | undefined,
): DiagramPlacementFailure | undefined {
    if (parent === undefined) return undefined;
    if (parent.ydoc !== project.ydoc) return { ok: false, reason: "cross-project" };
    let parentId: string;
    try {
        parentId = parent.id;
    } catch {
        return { ok: false, reason: "parent-not-found" };
    }
    if (!parentId) return { ok: false, reason: "parent-not-found" };
    if (!canAcceptChild(parent, { componentType: DIAGRAM_COMPONENT_TYPE })) {
        return { ok: false, reason: "invalid-parent" };
    }
    return undefined;
}

export interface DiagramInsertOptions {
    index?: number;
    columnSpan?: number;
}

/**
 * Create a brand-new Diagram and one transclusion of it as a direct child of
 * `parent` (`undefined` for the page root). Used by the Layout context menu
 * and by any other production surface that names an explicit parent.
 */
export function createMermaidDiagramUnderParent(
    project: Project,
    parent: Item | undefined,
    author: string,
    auth: DiagramAuthorization,
    options: DiagramInsertOptions = {},
): DiagramPlacementResult {
    if (!canMutateDiagrams(auth)) return { ok: false, reason: "capability-denied" };
    const destinationFailure = checkParentDestination(project, parent);
    if (destinationFailure) return destinationFailure;

    let itemId = "";
    let diagramId = "";
    project.ydoc.transact(() => {
        diagramId = createDiagram(project);
        const created = parent
            ? parent.items.addNode(author, options.index)
            : project.items.addNode(author, options.index);
        created.componentType = DIAGRAM_COMPONENT_TYPE;
        setItemDiagramId(created, diagramId);
        if (options.columnSpan !== undefined) created.columnSpan = options.columnSpan;
        itemId = created.id;
    });
    return { ok: true, itemId, diagramId };
}

/**
 * Insert another transclusion of an *existing* Diagram as a direct child of
 * `parent` (`undefined` for the page root) — no new Diagram or source is
 * created or copied (REQ-003).
 */
export function insertExistingMermaidDiagramUnderParent(
    project: Project,
    diagramId: string,
    parent: Item | undefined,
    author: string,
    auth: DiagramAuthorization,
    options: DiagramInsertOptions = {},
): DiagramPlacementResult {
    if (!canMutateDiagrams(auth)) return { ok: false, reason: "capability-denied" };
    const destinationFailure = checkParentDestination(project, parent);
    if (destinationFailure) return destinationFailure;
    if (!diagramExists(project, diagramId)) return { ok: false, reason: "diagram-not-found" };

    let itemId = "";
    project.ydoc.transact(() => {
        const created = parent
            ? parent.items.addNode(author, options.index)
            : project.items.addNode(author, options.index);
        created.componentType = DIAGRAM_COMPONENT_TYPE;
        setItemDiagramId(created, diagramId);
        if (options.columnSpan !== undefined) created.columnSpan = options.columnSpan;
        itemId = created.id;
    });
    return { ok: true, itemId, diagramId };
}

/**
 * Create a brand-new Diagram and transclusion at a slash-command cursor
 * target — the page-root/under-a-Text-item counterpart of
 * `createMermaidDiagramUnderParent`, reusing the same replace-or-insert-after
 * placement `createVisualNodeAtTarget` already gives every other visual node
 * kind. The Diagram is only created once that placement has actually
 * succeeded, so a placement failure (no valid target/parent) never leaves an
 * orphaned Diagram behind.
 */
export function createMermaidDiagramAtTarget(
    project: Project,
    target: Item | undefined,
    remainingText: string,
    author: string,
    auth: DiagramAuthorization,
): DiagramPlacementResult {
    if (!canMutateDiagrams(auth)) return { ok: false, reason: "capability-denied" };

    let result: DiagramPlacementResult = { ok: false, reason: "parent-not-found" };
    const build = () => {
        const created = createVisualNodeAtTarget(target, remainingText, DIAGRAM_COMPONENT_TYPE, author);
        if (!created) return;
        const diagramId = createDiagram(project);
        setItemDiagramId(created.item, diagramId);
        result = { ok: true, itemId: created.item.id, diagramId };
    };

    const doc = project.ydoc;
    if (typeof doc?.transact === "function") doc.transact(build, null);
    else build();
    return result;
}

/**
 * Insert a transclusion of an *existing* Diagram at a slash-command cursor
 * target. Mirrors `createMermaidDiagramAtTarget`, binding the chosen
 * `diagramId` instead of creating a new one.
 */
export function insertExistingMermaidDiagramAtTarget(
    project: Project,
    diagramId: string,
    target: Item | undefined,
    remainingText: string,
    author: string,
    auth: DiagramAuthorization,
): DiagramPlacementResult {
    if (!canMutateDiagrams(auth)) return { ok: false, reason: "capability-denied" };
    if (!diagramExists(project, diagramId)) return { ok: false, reason: "diagram-not-found" };

    let result: DiagramPlacementResult = { ok: false, reason: "parent-not-found" };
    const build = () => {
        const created = createVisualNodeAtTarget(target, remainingText, DIAGRAM_COMPONENT_TYPE, author);
        if (!created) return;
        setItemDiagramId(created.item, diagramId);
        result = { ok: true, itemId: created.item.id, diagramId };
    };

    const doc = project.ydoc;
    if (typeof doc?.transact === "function") doc.transact(build, null);
    else build();
    return result;
}
