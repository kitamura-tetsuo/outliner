import type { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { nodeKindOf, type OutlineNodeKind } from "../../../shared/src/services/outlineNodeKind.js";
import { type Item, type Items, Project } from "../schema/app-schema.js";

export class McpReadError extends Error {
    constructor(
        public readonly code: "invalid_argument" | "not_found" | "forbidden" | "kind_mismatch",
        message: string,
    ) {
        super(message);
    }
}

export interface OutlineNodeRead {
    id: string;
    kind: OutlineNodeKind;
    parentId?: string;
    childCount: number;
    text?: string;
    gridId?: string;
    calendarId?: string;
    children?: OutlineNodeRead[];
}

const ID = /^[A-Za-z0-9_-]{1,200}$/;
function assertId(value: string, label: string): void {
    if (!ID.test(value)) throw new McpReadError("invalid_argument", `Invalid ${label}`);
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
    const value: OutlineNodeRead = { id: item.id, kind, parentId: parentId(item), childCount: item.items.length };
    if (kind === "text") value.text = item.text;
    if (kind === "grid") value.gridId = item.yjsGridId;
    if (kind === "calendar") value.calendarId = item.calendarId;
    return value;
}

export class OutlinerReadService {
    constructor(
        private readonly hocuspocus: Pick<Hocuspocus, "openDirectConnection">,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        private readonly accessibleProjectIds: (uid: string) => Promise<string[]>,
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
            kind: "project" | "page" | "grid" | "calendar" | "table";
        }
    > {
        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            throw new McpReadError("invalid_argument", "Malformed Outliner URL");
        }
        if (
            url.protocol !== "https:"
            && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
        ) {
            throw new McpReadError("invalid_argument", "Unsupported Outliner URL");
        }
        let parts: string[];
        try {
            parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        } catch {
            throw new McpReadError("invalid_argument", "Malformed Outliner URL encoding");
        }
        const entityKind = ["grids", "calendars", "tables"].includes(parts[0] ?? "")
            ? parts.shift() as "grids" | "calendars" | "tables"
            : undefined;
        if (parts.length < 1 || parts.length > 2 || (entityKind && parts.length !== 2)) {
            throw new McpReadError("invalid_argument", "Unsupported Outliner URL path");
        }
        const projectTitle = parts[0]!;
        const candidates = await this.accessibleProjectIds(uid);
        for (const projectId of candidates) {
            if (!ID.test(projectId) || !await this.canAccess(uid, projectId)) continue;
            const resolved = await this.withProject(uid, projectId, project => {
                if (project.title !== projectTitle) return undefined;
                if (entityKind) {
                    const entityId = parts[1]!;
                    assertId(entityId, "entity ID");
                    return { projectId, entityId, kind: entityKind.slice(0, -1) as "grid" | "calendar" | "table" };
                }
                if (!parts[1]) return { projectId, kind: "project" as const };
                const page = Array.from(project.items).find(item => item.text === parts[1]);
                if (!page) throw new McpReadError("not_found", "Page not found");
                return { projectId, pageId: page.id, kind: "page" as const };
            });
            if (resolved) return resolved;
        }
        throw new McpReadError("not_found", "Accessible project not found");
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
            return { id: gridId, sourceTableId: grid.get("sourceTableId"), query: grid.get("query") };
        });
    }

    getCalendar(uid: string, projectId: string, calendarId: string): Promise<Record<string, unknown>> {
        assertId(calendarId, "Calendar ID");
        return this.withProject(uid, projectId, project => {
            const calendar = project.calendars.get(calendarId);
            if (!calendar) throw new McpReadError("not_found", "Calendar not found");
            return { id: calendarId, sourceTableId: calendar.get("sourceTableId"), query: calendar.get("query") };
        });
    }
}
