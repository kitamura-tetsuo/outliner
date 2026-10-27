import { getKanbanRegistry } from "../../../shared/src/services/kanbanDefinition.js";
import { canAcceptChild, nodeKindOf } from "../../../shared/src/services/outlineNodeKind.js";
import type { DocumentStore } from "../persistence.js";
import { type Item, Project } from "../schema/app-schema.js";
import {
    type KanbanDefinitionKey,
    KanbanObservationError,
    type KanbanObservationGuard,
    KanbanObservationService,
} from "./kanban-observations.js";
import { McpReadError } from "./mcp-error.js";

const DEFINITION_KEYS: readonly KanbanDefinitionKey[] = [
    "name",
    "query",
    "groupField",
    "titleField",
    "detailFields",
    "laneOrder",
];

export interface KanbanLifecycleRequest {
    projectId: string;
    kanbanId: string;
    observationToken: string;
    dryRun?: boolean;
}

export interface PlaceKanbanRequest extends KanbanLifecycleRequest {
    destination: { pageId: string; layoutId?: string; };
    columnSpan?: number;
}

export interface RemoveKanbanRequest extends KanbanLifecycleRequest {
    placementId: string;
}

export type KanbanLifecycleResult = {
    projectId: string;
    kanbanId: string;
    operation: "place" | "remove_placement" | "delete";
    dryRun: boolean;
    applied: boolean;
    wouldChange?: boolean;
    placementId?: string;
    itemId?: string;
    pageId?: string;
    parentId?: string;
    removedPlacementCount?: number;
    removedPlacementIds?: string[];
    placementIdsTruncated?: boolean;
};

/** Server-side lifecycle boundary. All final checks and publication are synchronous in one Yjs transaction. */
export class OutlinerKanbanLifecycleService {
    constructor(
        private readonly observations: KanbanObservationService,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        private readonly storeDocument?: DocumentStore,
    ) {}

    async authorize(uid: string, projectId: string): Promise<void> {
        let allowed = false;
        try {
            allowed = await this.canAccess(uid, projectId);
        } catch { /* fail closed */ }
        if (!allowed) throw new McpReadError("forbidden", "Project is inaccessible");
    }

    async place(uid: string, request: PlaceKanbanRequest): Promise<KanbanLifecycleResult> {
        validateCommon(request);
        if (request.destination.layoutId === undefined && request.columnSpan !== undefined) {
            throw new McpReadError("invalid_argument", "columnSpan is only valid for a Layout destination");
        }
        if (
            request.destination.layoutId !== undefined && request.columnSpan !== undefined
            && (!Number.isInteger(request.columnSpan) || request.columnSpan < 1 || request.columnSpan > 12)
        ) {
            throw new McpReadError("invalid_argument", "columnSpan must be an integer from 1 through 12");
        }
        await this.authorize(uid, request.projectId);
        const guard = this.acquire(uid, request);
        try {
            const project = Project.fromDoc(guard.projectDoc as never);
            guard.assertCurrent({ kind: "definition", kanbanId: request.kanbanId, keys: [] });
            const page = uniqueById(project, request.destination.pageId);
            if (!page || !isTopLevel(page) || nodeKindOf(page) !== "text") {
                throw new McpReadError("not_found", "Destination Page was not found");
            }
            const layout = request.destination.layoutId === undefined
                ? undefined
                : uniqueById(project, request.destination.layoutId);
            if (request.destination.layoutId !== undefined && (!layout || nodeKindOf(layout) !== "layout")) {
                throw new McpReadError("kind_mismatch", "Destination Layout was not found or is not a Layout");
            }
            if (layout && !sameItem(containingPage(layout), page)) {
                throw new McpReadError(
                    "validation_failed",
                    "Destination Layout is not contained by the specified Page",
                );
            }
            const pageMap = raw(page);
            const layoutMap = layout ? raw(layout) : undefined;
            await this.authorize(uid, request.projectId);
            this.assertDefinition(guard, request.kanbanId, []);
            if (
                rawOrUndefined(page) !== pageMap || !isTopLevel(page) || nodeKindOf(page) !== "text"
                || (layout && (rawOrUndefined(layout) !== layoutMap || nodeKindOf(layout) !== "layout"
                    || !sameItem(containingPage(layout), page)))
            ) {
                throw new McpReadError("stale_revision", "Destination changed before placement");
            }
            const parent = layout ?? page;
            if (!canAcceptChild(parent, { componentType: "kanban" })) {
                throw new McpReadError("validation_failed", "Destination cannot contain a Kanban");
            }
            if (request.dryRun) return base(request, "place", { wouldChange: true });
            if (!this.storeDocument) throw new McpReadError("internal_failure", "Project persistence is unavailable");
            let created!: Item;
            guard.projectDoc.transact(() => {
                created = parent.items.addNode(uid);
                created.componentType = "kanban";
                created.kanbanId = request.kanbanId;
                if (layout) created.columnSpan = request.columnSpan ?? 12;
            }, "mcp:place-kanban");
            const placementId = created.key;
            const itemId = created.id;
            const pageId = page.id;
            const parentId = parent.id;
            await this.persist(request.projectId, guard.projectDoc);
            return base(request, "place", {
                applied: true,
                placementId,
                itemId,
                pageId,
                parentId,
            });
        } finally {
            guard.release();
        }
    }

    async remove(uid: string, request: RemoveKanbanRequest): Promise<KanbanLifecycleResult> {
        validateCommon(request);
        await this.authorize(uid, request.projectId);
        const guard = this.acquire(uid, request);
        try {
            const project = Project.fromDoc(guard.projectDoc as never);
            this.assertPlacement(guard, request.kanbanId, request.placementId);
            await this.authorize(uid, request.projectId);
            this.assertPlacement(guard, request.kanbanId, request.placementId);
            const item = byKey(project, request.placementId);
            if (!item || item.componentType !== "kanban" || item.kanbanId !== request.kanbanId || item.items.length) {
                throw new McpReadError("stale_revision", "Observed Kanban placement is no longer removable");
            }
            const page = containingPage(item);
            const parent = parentItem(item);
            if (!page || !parent) throw new McpReadError("validation_failed", "Placement location is unreadable");
            const itemId = item.id;
            const pageId = page.id;
            const parentId = parent.id;
            if (request.dryRun) return base(request, "remove_placement", { wouldChange: true });
            if (!this.storeDocument) throw new McpReadError("internal_failure", "Project persistence is unavailable");
            guard.projectDoc.transact(() => item.delete(), "mcp:remove-kanban-placement");
            await this.persist(request.projectId, guard.projectDoc);
            return base(request, "remove_placement", {
                applied: true,
                placementId: item.key,
                itemId,
                pageId,
                parentId,
            });
        } finally {
            guard.release();
        }
    }

    async delete(uid: string, request: KanbanLifecycleRequest): Promise<KanbanLifecycleResult> {
        validateCommon(request);
        await this.authorize(uid, request.projectId);
        const guard = this.acquire(uid, request);
        try {
            this.assertDefinition(guard, request.kanbanId, DEFINITION_KEYS);
            await this.authorize(uid, request.projectId);
            this.assertDefinition(guard, request.kanbanId, DEFINITION_KEYS);
            const project = Project.fromDoc(guard.projectDoc as never);
            const placements = allItems(project).filter(item =>
                rawOrUndefined(item)?.get("componentType") === "kanban"
                && rawOrUndefined(item)?.get("kanbanId") === request.kanbanId
            );
            if (placements.some(item => item.items.length !== 0)) {
                throw new McpReadError("validation_failed", "A bound Kanban occurrence is not a leaf");
            }
            const ids = placements.map(item => item.key);
            if (request.dryRun) {
                return base(request, "delete", {
                    wouldChange: true,
                    removedPlacementCount: ids.length,
                    removedPlacementIds: ids.slice(0, 100),
                    placementIdsTruncated: ids.length > 100,
                });
            }
            if (!this.storeDocument) throw new McpReadError("internal_failure", "Project persistence is unavailable");
            guard.projectDoc.transact(() => {
                for (const item of placements) item.delete();
                getKanbanRegistry(guard.projectDoc as never).delete(request.kanbanId);
            }, "mcp:delete-kanban");
            await this.persist(request.projectId, guard.projectDoc);
            return base(request, "delete", {
                applied: true,
                removedPlacementCount: ids.length,
                removedPlacementIds: ids.slice(0, 100),
                placementIdsTruncated: ids.length > 100,
            });
        } finally {
            guard.release();
        }
    }

    private acquire(uid: string, request: KanbanLifecycleRequest): KanbanObservationGuard {
        try {
            return this.observations.acquire(uid, request.projectId, request.observationToken);
        } catch (error) {
            if (error instanceof KanbanObservationError) {
                throw new McpReadError("stale_revision", "Kanban observation is unavailable or stale", {
                    reason: error.code,
                });
            }
            throw error;
        }
    }
    private assertDefinition(guard: KanbanObservationGuard, kanbanId: string, keys: readonly KanbanDefinitionKey[]) {
        try {
            guard.assertCurrent({ kind: "definition", kanbanId, keys });
        } catch (error) {
            if (error instanceof KanbanObservationError) {
                throw new McpReadError("stale_revision", "Kanban observation is unavailable or stale", {
                    reason: error.code,
                });
            }
            throw error;
        }
    }
    private assertPlacement(guard: KanbanObservationGuard, kanbanId: string, placementId: string) {
        try {
            guard.assertCurrent({ kind: "placement", kanbanId, placementId });
        } catch (error) {
            if (error instanceof KanbanObservationError) {
                throw new McpReadError("stale_revision", "Kanban placement observation is unavailable or stale", {
                    reason: error.code,
                });
            }
            throw error;
        }
    }
    private async persist(projectId: string, doc: import("yjs").Doc) {
        try {
            await this.storeDocument!(`projects/${projectId}`, doc);
        } catch {
            throw new McpReadError("internal_failure", "Kanban lifecycle effect may have been applied", {
                applied: null,
            });
        }
    }
}

function validateCommon(request: KanbanLifecycleRequest) {
    const id = /^[A-Za-z0-9_-]{1,200}$/;
    if (!id.test(request.projectId) || !id.test(request.kanbanId) || !request.observationToken) {
        throw new McpReadError("invalid_argument", "Invalid Project, Kanban, or observation token");
    }
}
function base(
    request: KanbanLifecycleRequest,
    operation: KanbanLifecycleResult["operation"],
    extra: Partial<KanbanLifecycleResult>,
) {
    return {
        projectId: request.projectId,
        kanbanId: request.kanbanId,
        operation,
        dryRun: request.dryRun === true,
        applied: false,
        ...extra,
    } as KanbanLifecycleResult;
}
function allItems(project: Project): Item[] {
    const result: Item[] = [];
    const visit = (item: Item) => {
        result.push(item);
        for (const child of item.items) visit(child);
    };
    for (const page of project.items) visit(page);
    return result;
}
function uniqueById(project: Project, id: string): Item | undefined {
    const found = allItems(project).filter(item => item.id === id);
    if (found.length > 1) throw new McpReadError("validation_failed", "Destination ID is ambiguous");
    return found[0];
}
function byKey(project: Project, key: string) {
    return allItems(project).find(item => item.key === key);
}
function raw(item: Item) {
    const value = rawOrUndefined(item);
    if (!value) throw new McpReadError("not_found", "Item not found");
    return value;
}
function rawOrUndefined(item: Item) {
    try {
        return item.tree.getNodeValueFromKey(item.key) as { get(key: string): unknown; };
    } catch {
        return undefined;
    }
}
function parentItem(item: Item): Item | undefined {
    try {
        const key = item.tree.getNodeParentFromKey(item.key);
        return key && key !== "root" ? new (item.constructor as typeof Item)(item.ydoc, item.tree, key) : undefined;
    } catch {
        return undefined;
    }
}
function containingPage(item: Item): Item | undefined {
    let current: Item | undefined = item;
    let parent: Item | undefined;
    while ((parent = parentItem(current))) current = parent;
    return current && isTopLevel(current) ? current : undefined;
}
function isTopLevel(item: Item): boolean {
    try {
        return item.tree.getNodeParentFromKey(item.key) === "root";
    } catch {
        return false;
    }
}
function sameItem(left: Item | undefined, right: Item): boolean {
    return !!left && left.key === right.key && rawOrUndefined(left) === rawOrUndefined(right);
}
