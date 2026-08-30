import type { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { nodeKindOf, type OutlineNodeKind } from "../../../shared/src/services/outlineNodeKind.js";
import { type ProjectDescriptor, ProjectDirectoryError } from "../project-directory.js";
import { type Item, type Items, Project } from "../schema/app-schema.js";
import { type McpErrorCode, McpReadError } from "./mcp-error.js";
import { outlineItemRevision, revisionOf } from "./mutation-contract.js";

export type { McpErrorCode };
export { McpReadError };

export interface OutlineNodeRead {
    id: string;
    kind: OutlineNodeKind;
    parentId?: string;
    childCount: number;
    text?: string;
    gridId?: string;
    calendarId?: string;
    children?: OutlineNodeRead[];
    /**
     * Content-hash revision of this node's own outline_items fields (text,
     * done, tags, due/start/rrule, ...), computed with the exact same
     * formula writeRelation's outline_items precondition check uses. A
     * client can pass this straight back as write_relation's
     * expectedRevision to guard a read-modify-write cycle.
     */
    revision: string;
}

const ID = /^[A-Za-z0-9_-]{1,200}$/;
type ResolvableEntityKind = "grids" | "calendars" | "tables" | "schedules";

function assertId(value: string, label: string): void {
    if (!ID.test(value)) throw new McpReadError("invalid_argument", `Invalid ${label}`);
}

function parseResolvablePath(pathname: string): {
    projectTitle: string;
    pageTitle?: string;
    entityKind?: ResolvableEntityKind;
    entityId?: string;
    entityListKind?: "schedules";
} {
    const encodedParts = pathname.split("/");
    if (encodedParts[encodedParts.length - 1] === "") encodedParts.pop();
    if (encodedParts[0] !== "" || encodedParts.slice(1).some(part => part === "")) {
        throw new McpReadError("invalid_argument", "Unsupported Outliner URL path", {
            stage: "path_validation",
            partsLength: encodedParts.length - 1,
        });
    }

    let parts: string[];
    try {
        parts = encodedParts.slice(1).map(decodeURIComponent);
    } catch {
        throw new McpReadError("invalid_argument", "Malformed Outliner URL encoding", {
            stage: "url_decoding",
            pathnameLength: pathname.length,
        });
    }

    if (parts.length === 1) return { projectTitle: parts[0]! };
    if (parts.length === 2 && parts[1] !== "-") return { projectTitle: parts[0]!, pageTitle: parts[1]! };
    if (parts.length === 3 && parts[1] === "-" && parts[2] === "schedules") {
        return { projectTitle: parts[0]!, entityListKind: "schedules" };
    }

    // Keep accepting the pre-#5012 resource-first form for existing MCP
    // clients. The client itself only generates the canonical project-first
    // form below.
    if (parts.length === 3 && ["grids", "calendars", "tables", "schedules"].includes(parts[0]!)) {
        return {
            entityKind: parts[0] as ResolvableEntityKind,
            projectTitle: parts[1]!,
            entityId: parts[2]!,
        };
    }

    if (
        parts.length === 4 && parts[1] === "-"
        && ["grids", "calendars", "tables", "schedules"].includes(parts[2]!)
    ) {
        return {
            projectTitle: parts[0]!,
            entityKind: parts[2] as ResolvableEntityKind,
            entityId: parts[3]!,
        };
    }

    throw new McpReadError("invalid_argument", "Unsupported Outliner URL path", {
        stage: "path_validation",
        partsLength: parts.length,
        hasEntityKind: parts.includes("-"),
    });
}

function allItems(items: Items): Item[] {
    const result: Item[] = [];
    for (const item of items) {
        result.push(item, ...allItems(item.items));
    }
    return result;
}

function findItem(project: Project, itemId: string): Item {
    const item = allItems(project.items).find(candidate => candidate.id === itemId);
    if (!item) throw new McpReadError("not_found", "Item not found");
    return item;
}

function parentId(item: Item): string | undefined {
    const key = item.parent?.parentKey;
    if (!key || key === "root") return undefined;
    const parent = allItems(Project.fromDoc(item.ydoc).items).find(candidate => candidate.key === key);
    return parent?.id;
}

export function serializeItem(item: Item): OutlineNodeRead {
    const kind = nodeKindOf(item);
    const value: OutlineNodeRead = {
        id: item.id,
        kind,
        parentId: parentId(item),
        childCount: item.items.length,
        revision: outlineItemRevision(item),
    };
    if (kind === "text") value.text = item.text;
    if (kind === "grid") value.gridId = item.yjsGridId;
    if (kind === "calendar") value.calendarId = item.calendarId;
    return value;
}

export class OutlinerReadService {
    constructor(
        private readonly hocuspocus: Pick<Hocuspocus, "openDirectConnection">,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        private readonly accessibleProjects: (uid: string) => Promise<ProjectDescriptor[]>,
    ) {}

    private async withProject<T>(
        uid: string,
        projectId: string,
        read: (project: Project) => T | Promise<T>,
    ): Promise<T> {
        assertId(projectId, "project ID");
        if (!await this.canAccess(uid, projectId)) throw new McpReadError("forbidden", "Project is inaccessible");
        const connection = await this.hocuspocus.openDirectConnection(`projects/${projectId}`, { context: { uid } });
        try {
            return await read(Project.fromDoc(connection.document as unknown as Parameters<typeof Project.fromDoc>[0]));
        } finally {
            await connection.disconnect();
        }
    }

    async resolveUrl(
        uid: string,
        rawUrl: string,
    ): Promise<
        {
            projectId: string;
            pageId?: string;
            entityId?: string;
            kind: "project" | "page" | "grid" | "calendar" | "table" | "schedule" | "schedule-list";
        }
    > {
        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            throw new McpReadError("invalid_argument", "Malformed Outliner URL", {
                stage: "url_parsing",
                inputLength: rawUrl.length,
            });
        }
        if (
            url.protocol !== "https:"
            && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
        ) {
            throw new McpReadError("invalid_argument", "Unsupported Outliner URL", {
                stage: "url_validation",
                protocol: url.protocol,
                hostname: url.hostname,
            });
        }
        const { projectTitle, pageTitle, entityKind, entityId, entityListKind } = parseResolvablePath(url.pathname);
        if (entityId !== undefined) assertId(entityId, "entity ID");
        const resolutionDebug = {
            inputUrl: `${url.origin}${url.pathname}`,
            pathname: url.pathname,
            projectSegment: projectTitle,
            interpretedAs: "projectTitle",
            lookupCondition: "projectUsers.accessibleUserIds array-contains authenticated uid; exact title match",
        };
        let candidates: ProjectDescriptor[];
        try {
            candidates = await this.accessibleProjects(uid);
        } catch (error) {
            if (error instanceof ProjectDirectoryError) {
                throw new McpReadError("not_found", error.message, {
                    ...resolutionDebug,
                    stage: "project_directory_read",
                    internalOperation: error.debug?.internalOperation ?? "accessibleProjects",
                    directoryErrorCode: error.code,
                    ...error.debug,
                });
            }
            throw error;
        }

        let foundProjectWithoutEntity = false;
        let authorizedCandidateCount = 0;

        for (const candidate of candidates) {
            const { projectId } = candidate;
            if (!ID.test(projectId) || !await this.canAccess(uid, projectId)) continue;
            authorizedCandidateCount++;
            if (candidate.title !== projectTitle) continue;
            foundProjectWithoutEntity = true;
            const resolved = await this.withProject(uid, projectId, project => {
                if (entityListKind === "schedules") return { projectId, kind: "schedule-list" as const };
                if (entityKind) {
                    const exists = entityKind === "grids"
                        ? project.ydoc.getMap("yjsGrids").has(entityId!)
                        : entityKind === "calendars"
                        ? project.calendars.has(entityId!)
                        : entityKind === "tables"
                        ? project.ydoc.getMap("yjsTables").has(entityId!)
                        : project.schedules.has(entityId!);
                    if (!exists) {
                        throw new McpReadError("not_found", `${entityKind.slice(0, -1)} not found`, {
                            ...resolutionDebug,
                            stage: "entity_lookup",
                            requestedProjectTitle: projectTitle,
                            entityKind,
                            entityId,
                        });
                    }
                    return {
                        projectId,
                        entityId,
                        kind: entityKind.slice(0, -1) as "grid" | "calendar" | "table" | "schedule",
                    };
                }
                if (!pageTitle) return { projectId, kind: "project" as const };
                const page = Array.from(project.items).find(item => item.text === pageTitle);
                if (!page) {
                    throw new McpReadError("not_found", "Page not found", {
                        ...resolutionDebug,
                        stage: "page_lookup",
                        requestedProjectTitle: projectTitle,
                        requestedPageTitle: pageTitle,
                    });
                }
                return { projectId, pageId: page.id, kind: "page" as const };
            });
            if (resolved) return resolved;
        }

        throw new McpReadError("not_found", "Accessible project not found", {
            ...resolutionDebug,
            stage: candidates.length === 0
                ? "project_discovery"
                : authorizedCandidateCount === 0
                ? "authorization_recheck"
                : "project_title_matching",
            requestedProjectTitle: projectTitle,
            requestedPageTitle: pageTitle,
            accessibleProjectCount: candidates.length,
            authorizedCandidateCount,
            foundProjectWithoutEntity,
        });
    }

    getItem(uid: string, projectId: string, itemId: string): Promise<OutlineNodeRead> {
        assertId(itemId, "item ID");
        return this.withProject(uid, projectId, project => serializeItem(findItem(project, itemId)));
    }

    getSubtree(
        uid: string,
        projectId: string,
        itemId: string,
        depth = 3,
        limit = 100,
    ): Promise<{ root: OutlineNodeRead; truncated: boolean; }> {
        if (
            !Number.isInteger(depth) || depth < 0 || depth > 10 || !Number.isInteger(limit) || limit < 1 || limit > 500
        ) {
            throw new McpReadError("invalid_argument", "depth must be 0..10 and limit must be 1..500");
        }
        return this.withProject(uid, projectId, project => {
            let count = 0;
            let truncated = false;
            const visit = (item: Item, remaining: number): OutlineNodeRead => {
                count++;
                const output = serializeItem(item);
                if (remaining === 0 && item.items.length > 0) truncated = true;
                else if (remaining > 0) {
                    output.children = [];
                    for (const child of item.items) {
                        if (count >= limit) {
                            truncated = true;
                            break;
                        }
                        output.children.push(visit(child, remaining - 1));
                    }
                }
                return output;
            };
            return { root: visit(findItem(project, itemId), depth), truncated };
        });
    }

    getAncestors(uid: string, projectId: string, itemId: string): Promise<OutlineNodeRead[]> {
        return this.withProject(uid, projectId, project => {
            let item = findItem(project, itemId);
            const chain = [serializeItem(item)];
            while (parentId(item)) {
                item = findItem(project, parentId(item)!);
                chain.push(serializeItem(item));
            }
            return chain.reverse();
        });
    }

    searchItems(uid: string, projectId: string, query: string, limit = 20): Promise<OutlineNodeRead[]> {
        if (!query.trim() || query.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new McpReadError(
                "invalid_argument",
                "query is required (max 200 characters) and limit must be 1..100",
            );
        }
        return this.withProject(uid, projectId, project =>
            allItems(project.items)
                .filter(item =>
                    nodeKindOf(item) === "text" && item.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())
                )
                .slice(0, limit).map(serializeItem));
    }

    getGrid(uid: string, projectId: string, gridId: string): Promise<Record<string, unknown>> {
        assertId(gridId, "Grid ID");
        return this.withProject(uid, projectId, project => {
            const grid = project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get(gridId);
            if (!grid) throw new McpReadError("not_found", "Grid not found");
            const query = String(grid.get("query") ?? "");
            return {
                id: gridId,
                name: String(grid.get("name") ?? ""),
                sourceTableId: grid.get("sourceTableId"),
                query,
                columnOrder: yValueToPlain(grid.get("columnOrder")) ?? [],
                components: yValueToPlain(grid.get("components")) ?? {},
                // Matches OutlinerRelationService.setViewQuery's own
                // revisionOf(query) formula exactly, so this can be passed
                // straight back as set_view_query's expectedRevision.
                revision: revisionOf(query),
            };
        });
    }

    getCalendar(uid: string, projectId: string, calendarId: string): Promise<Record<string, unknown>> {
        assertId(calendarId, "Calendar ID");
        return this.withProject(uid, projectId, project => {
            const calendar = project.calendars.get(calendarId);
            if (!calendar) throw new McpReadError("not_found", "Calendar not found");
            const settings = yValueToPlain(calendar) as Record<string, unknown>;
            const query = String(settings.query ?? "");
            return {
                id: calendarId,
                ...settings,
                name: String(settings.name ?? ""),
                query,
                viewType: String(settings.viewType ?? "week"),
                groupAxes: settings.groupAxes ?? [],
                laneOrder: settings.laneOrder ?? [],
                // Matches OutlinerRelationService.setViewQuery's own
                // revisionOf(query) formula exactly, so this can be passed
                // straight back as set_view_query's expectedRevision.
                revision: revisionOf(query),
            };
        });
    }
}

function yValueToPlain(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(yValueToPlain);
    if (value && typeof value === "object" && "entries" in value && typeof value.entries === "function") {
        return Object.fromEntries(
            Array.from(value.entries() as Iterable<[string, unknown]>, ([key, child]) => [key, yValueToPlain(child)]),
        );
    }
    if (value && typeof value === "object" && "toArray" in value && typeof value.toArray === "function") {
        return (value.toArray() as unknown[]).map(yValueToPlain);
    }
    return value;
}
