import type { Hocuspocus } from "@hocuspocus/server";
import crypto from "crypto";
import * as Y from "yjs";
import {
    getKanbanRegistry,
    type KanbanLaneValue,
    type KanbanSettings,
    readKanbanSettings,
} from "../../../shared/src/services/kanbanDefinition.js";
import {
    analyzeProjectQueryProvenance,
    type ProjectQueryProvenance,
    unambiguousPhysicalColumn,
    unambiguousRowSource,
} from "../../../shared/src/services/projectQueryProvenance.js";
import { parseSqlIdentifiers, validateReadOnlySelect } from "../../../shared/src/services/readOnlySql.js";
import type {
    SelectProvenanceEvidence,
    SelectRelationEvidence,
} from "../../../shared/src/services/viewSourceEvidence.js";
import { type Item, Project } from "../schema/app-schema.js";
import { boundGridRelations } from "./grid-query-evidence.js";
import { closeLiveRoom, type DirectConnection, isLiveRoom, type LiveRoomHost, openLiveRoom } from "./live-room.js";
import { McpReadError } from "./mcp-error.js";
import { acquireDb, materializeProjectCatalog, resultColumnMetadata, SYSTEM_SCHEMA } from "./relation-service.js";

const LIMITS = { queryBytes: 16 * 1024, rows: 10_000, columns: 100, lanes: 1_000, jsonBytes: 8 * 1024 * 1024 } as const;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
type KanbanEntry = NonNullable<ReturnType<ReturnType<typeof getKanbanRegistry>["get"]>>;

export type KanbanObservationStatus = "success" | "incomplete" | "invalid" | "unavailable" | "error";
export type KanbanReadOnlyReason = "unproven_source" | "computed" | "identity" | "unsupported_source_field";
export interface KanbanFieldRoute {
    output: string;
    writable: boolean;
    source?: { kind: "table" | "system"; id: string; sqlName: string; field: string; };
    reason?: KanbanReadOnlyReason;
}
export interface KanbanObservedCard {
    occurrenceId: string;
    row: Record<string, unknown>;
    source?: { kind: "table" | "system"; id: string; sqlName: string; rowId: string; };
}
export interface KanbanObservedLane {
    key: KanbanLaneValue;
    cards: KanbanObservedCard[];
}

export class KanbanProjectionObservation {
    private released = false;
    constructor(
        public readonly status: KanbanObservationStatus,
        public readonly current: boolean,
        public readonly settings: KanbanSettings | undefined,
        public readonly lanes: readonly KanbanObservedLane[],
        public readonly columns: readonly { name: string; type: string; enum?: unknown; }[],
        public readonly routes: readonly KanbanFieldRoute[],
        public readonly reason: string | undefined,
        public readonly limit: keyof typeof LIMITS | undefined,
        /** Trusted handles are intentionally not part of any serialized response. */
        readonly handles: { project: DirectConnection; sources: ReadonlyMap<string, DirectConnection>; },
        private readonly currentCheck: () => boolean,
        private readonly releaseHandles: () => Promise<void>,
    ) {}
    isCurrent(): boolean {
        return !this.released && this.current && this.currentCheck();
    }
    async release(): Promise<void> {
        if (this.released) return;
        this.released = true;
        await this.releaseHandles();
    }
}

interface TableInput {
    id: string;
    sqlName: string;
    connection: DirectConnection;
    doc: Y.Doc;
    schema: string;
    records: readonly [string, Y.Map<unknown>][];
}

/** Complete, retained server-side observation of one saved Project Kanban. */
export class OutlinerKanbanQueryService {
    constructor(
        private readonly hocuspocus: Pick<Hocuspocus, "openDirectConnection"> & Partial<Pick<Hocuspocus, "documents">>,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        private readonly options: { beforeCertification?: () => Promise<void>; } = {},
    ) {}

    async openObservation(uid: string, projectId: string, kanbanId: string): Promise<KanbanProjectionObservation> {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(projectId) || !/^[A-Za-z0-9_-]{1,200}$/.test(kanbanId)) {
            throw new McpReadError("invalid_argument", "Invalid project or Kanban ID");
        }
        await this.authorize(uid, projectId);
        const host = this.host();
        const project = await openLiveRoom(host, `projects/${projectId}`, uid, { effect: "none" });
        const sources = new Map<string, DirectConnection>();
        let transferred = false;
        try {
            await this.authorize(uid, projectId);
            const doc = project.document as unknown as Y.Doc;
            const entry = getKanbanRegistry(doc as never).get(kanbanId);
            if (!entry) throw new McpReadError("not_found", "Kanban not found");
            const settings = readKanbanSettings(entry);
            const querySize = Buffer.byteLength(settings.query, "utf8");
            if (querySize > LIMITS.queryBytes) {
                return await this.finish(
                    project,
                    sources,
                    doc,
                    entry,
                    settings,
                    "unavailable",
                    "resource_limit",
                    "queryBytes",
                );
            }
            if (!settings.query.trim() || !settings.groupField) {
                return await this.finish(project, sources, doc, entry, settings, "incomplete", "missing_role");
            }
            let query: string;
            try {
                query = validateReadOnlySelect(settings.query, false);
            } catch {
                return await this.finish(project, sources, doc, entry, settings, "invalid", "invalid_query");
            }

            const identifiers = parseSqlIdentifiers(query);
            const tables = [...doc.getMap<Y.Map<unknown>>("yjsTables").entries()].flatMap(([id, value]) => {
                const sqlName = String(value.get("sqlName") ?? "");
                return IDENT.test(sqlName) && (identifiers.has(sqlName) || identifiers.has(sqlName.toLowerCase()))
                    ? [{ id, sqlName }]
                    : [];
            });
            const inputs: TableInput[] = [];
            for (const table of tables) {
                const connection = await openLiveRoom(host, `projects/${projectId}/tables/${table.id}`, uid, {
                    effect: "none",
                });
                sources.set(table.id, connection);
                const tableDoc = connection.document as unknown as Y.Doc;
                inputs.push({
                    ...table,
                    connection,
                    doc: tableDoc,
                    schema: tableDoc.getText("schema").toString(),
                    records: [...tableDoc.getMap<Y.Map<unknown>>("data").entries()],
                });
            }
            const captured = snapshot(doc, entry, inputs);
            const lease = await acquireDb();
            try {
                const catalog = await materializeProjectCatalog(lease.db, projectId, doc as never);
                await lease.db.exec(SYSTEM_SCHEMA);
                for (const row of outlineRows(Project.fromDoc(doc as never))) {
                    await lease.db.query(
                        `INSERT INTO outline_items VALUES (${row.map((_, i) => `$${i + 1}`).join(",")})`,
                        row,
                    );
                }
                const evidenceSources: SelectRelationEvidence[] = [{
                    kind: "system",
                    id: "outline_items",
                    sqlName: "outline_items",
                    schemaRevision: revision(SYSTEM_SCHEMA),
                    columns: await columnsFor(lease.db, "outline_items"),
                }];
                for (const table of inputs) {
                    if (!table.schema.trim()) continue;
                    await lease.db.exec(table.schema);
                    await loadRecords(lease.db, table.sqlName, table.records);
                    evidenceSources.push({
                        kind: "table",
                        id: table.id,
                        sqlName: table.sqlName,
                        schemaRevision: revision(table.schema),
                        columns: await columnsFor(lease.db, table.sqlName),
                    });
                }
                const normalized = query.replace(/;\s*$/, "");
                const result = await lease.db.query<Record<string, unknown>>(
                    `SELECT * FROM (${normalized}\n) AS kanban_observation LIMIT ${LIMITS.rows + 1}`,
                );
                if ((result.fields?.length ?? 0) > LIMITS.columns) {
                    return await this.finish(
                        project,
                        sources,
                        doc,
                        entry,
                        settings,
                        "unavailable",
                        "resource_limit",
                        "columns",
                    );
                }
                if (result.rows.length > LIMITS.rows) {
                    return await this.finish(
                        project,
                        sources,
                        doc,
                        entry,
                        settings,
                        "unavailable",
                        "resource_limit",
                        "rows",
                    );
                }
                const jsonBytes = Buffer.byteLength(
                    JSON.stringify({ rows: result.rows, fields: result.fields }),
                    "utf8",
                );
                if (jsonBytes > LIMITS.jsonBytes) {
                    return await this.finish(
                        project,
                        sources,
                        doc,
                        entry,
                        settings,
                        "unavailable",
                        "resource_limit",
                        "jsonBytes",
                    );
                }
                const names = (result.fields ?? []).map(field => field.name);
                const invalidRole = [settings.groupField, settings.titleField, ...settings.detailFields]
                    .filter((field): field is string => !!field).find(field =>
                        names.filter(name => name === field).length !== 1
                    );
                if (invalidRole) {
                    return await this.finish(project, sources, doc, entry, settings, "invalid", "invalid_role_column");
                }
                const binding = await boundGridRelations(
                    lease.db,
                    normalized,
                    names.length,
                    evidenceSources.map(source => source.sqlName),
                );
                const evidence: SelectProvenanceEvidence = {
                    queryId: crypto.randomUUID(),
                    queryRevision: 1,
                    query,
                    executionGeneration: 1,
                    catalogGeneration: 1,
                    catalogRevision: catalog.snapshot.revision,
                    dependencyStatus: binding.status,
                    sources: evidenceSources.filter(source => binding.relations.includes(source.sqlName)),
                    columns: (result.fields ?? []).map(field => ({ name: field.name, typeId: field.dataTypeID })),
                };
                const analysis = analyzeProjectQueryProvenance(evidence);
                const projection = projectRows(result.rows, settings, analysis, evidence.queryId);
                if (!projection) {
                    return await this.finish(project, sources, doc, entry, settings, "invalid", "invalid_group_value");
                }
                if (projection.lanes.length > LIMITS.lanes) {
                    return await this.finish(
                        project,
                        sources,
                        doc,
                        entry,
                        settings,
                        "unavailable",
                        "resource_limit",
                        "lanes",
                    );
                }
                await this.options.beforeCertification?.();
                await this.authorize(uid, projectId);
                const currentCheck = () => this.inputsCurrent(host, projectId, doc, entry, inputs, captured);
                if (!currentCheck()) {
                    return await this.finish(project, sources, doc, entry, settings, "unavailable", "stale_evidence");
                }
                const metadata = await resultColumnMetadata(lease.db, result.fields ?? [], catalog);
                const routes = roleRoutes(settings, analysis, evidence.sources);
                const release = releaseAll(host, project, sources);
                transferred = true;
                return new KanbanProjectionObservation(
                    "success",
                    true,
                    settings,
                    projection.lanes,
                    metadata,
                    routes,
                    undefined,
                    undefined,
                    { project, sources },
                    currentCheck,
                    release,
                );
            } catch (error) {
                const reason = isMissingRelation(error) ? "missing_source" : "execution_error";
                return await this.finish(
                    project,
                    sources,
                    doc,
                    entry,
                    settings,
                    reason === "missing_source" ? "unavailable" : "error",
                    reason,
                );
            } finally {
                lease.release();
            }
        } finally {
            if (!transferred) await releaseAll(host, project, sources)();
        }
    }

    private async finish(
        project: DirectConnection,
        sources: Map<string, DirectConnection>,
        doc: Y.Doc,
        entry: KanbanEntry,
        settings: KanbanSettings,
        status: KanbanObservationStatus,
        reason: string,
        limit?: keyof typeof LIMITS,
    ): Promise<KanbanProjectionObservation> {
        return new KanbanProjectionObservation(
            status,
            false,
            settings,
            [],
            [],
            [],
            reason,
            limit,
            { project, sources },
            () => false,
            releaseAll(this.host(), project, sources),
        );
    }
    private inputsCurrent(
        host: LiveRoomHost,
        projectId: string,
        doc: Y.Doc,
        entry: KanbanEntry,
        inputs: TableInput[],
        captured: string,
    ) {
        return getKanbanRegistry(doc as never).get(
                    [...getKanbanRegistry(doc as never).entries()].find(([, value]) => value === entry)?.[0] ?? "",
                ) === entry
            && isLiveRoom(host, `projects/${projectId}`, doc)
            && inputs.every(input => isLiveRoom(host, `projects/${projectId}/tables/${input.id}`, input.doc))
            && snapshot(doc, entry, inputs) === captured;
    }
    private host(): LiveRoomHost {
        if (!this.hocuspocus.documents) {
            throw new McpReadError("internal_failure", "Live room authority is unavailable");
        }
        return this.hocuspocus as LiveRoomHost;
    }
    private async authorize(uid: string, projectId: string) {
        try {
            if (await this.canAccess(uid, projectId)) return;
        } catch { /* sanitize ACL failures */ }
        throw new McpReadError("forbidden", "Project is inaccessible");
    }
}

function projectRows(
    rows: readonly Record<string, unknown>[],
    settings: KanbanSettings,
    analysis: ProjectQueryProvenance,
    queryId: string,
) {
    const by = new Map<KanbanLaneValue, KanbanObservedCard[]>(), seen: KanbanLaneValue[] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!, key = row[settings.groupField!];
        if (key !== null && typeof key !== "string") return undefined;
        const lane = key as KanbanLaneValue;
        if (!by.has(lane)) {
            by.set(lane, []);
            seen.push(lane);
        }
        const identity = unambiguousRowSource(analysis, row);
        by.get(lane)!.push({
            occurrenceId: `${queryId}:${i}`,
            row,
            ...(identity
                ? {
                    source: {
                        ...identity.source,
                        rowId: identity.rowId,
                    },
                }
                : {}),
        });
    }
    const eligible = [...seen], preferred = settings.laneOrder.filter(lane => eligible.includes(lane));
    return {
        lanes: [...preferred, ...eligible.filter(lane => !preferred.includes(lane))].map(key => ({
            key,
            cards: by.get(key)!,
        })),
    };
}

function roleRoutes(
    settings: KanbanSettings,
    analysis: ProjectQueryProvenance,
    sources: readonly SelectRelationEvidence[],
): KanbanFieldRoute[] {
    return [settings.groupField, settings.titleField, ...settings.detailFields].filter((v): v is string => !!v).map(
        output => {
            if (output === "id" || output === "source_id" || output === "source_kind") {
                return { output, writable: false, reason: "identity" };
            }
            const matches = analysis.suppliers.flatMap(source => {
                const field = unambiguousPhysicalColumn(analysis, source.sqlName, output);
                return field ? [{ source, field }] : [];
            });
            if (matches.length !== 1) {
                return {
                    output,
                    writable: false,
                    reason: analysis.status === "proven" ? "computed" : "unproven_source",
                };
            }
            const match = matches[0]!,
                evidence = sources.find(source => source.id === match.source.id && source.kind === match.source.kind);
            if (!evidence?.columns.includes(match.field) || match.field === "id") {
                return {
                    output,
                    writable: false,
                    reason: "unsupported_source_field",
                };
            }
            return { output, writable: true, source: { ...match.source, field: match.field } };
        },
    );
}

async function columnsFor(db: import("@electric-sql/pglite").PGlite, relation: string) {
    return (await db.query<{ column_name: string; }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
        [relation],
    )).rows.map(row => row.column_name);
}
async function loadRecords(
    db: import("@electric-sql/pglite").PGlite,
    table: string,
    records: readonly [string, Y.Map<unknown>][],
) {
    for (const [id, record] of records) {
        const values: Record<string, unknown> = { ...Object.fromEntries(record.entries()), id },
            keys = Object.keys(values);
        await db.query(
            `INSERT INTO "${table}" (${keys.map(key => `"${key.replace(/"/g, '""')}"`).join(",")}) VALUES (${
                keys.map((_, i) => `$${i + 1}`).join(",")
            })`,
            keys.map(key => values[key]),
        );
    }
}
function outlineRows(project: Project): unknown[][] {
    const items: Item[] = [],
        visit = (values: Iterable<Item>) => {
            for (const item of values) {
                items.push(item);
                visit(item.items);
            }
        };
    visit(project.items);
    return items.filter(item => item.yMap.get("due") || item.yMap.get("start") || item.yMap.get("rrule")).map(item => {
        const v = item.yMap, due = v.get("due"), start = v.get("start");
        let pageId = item.key, cursor = item;
        while (cursor.parent && cursor.parent.parentKey !== "root") {
            pageId = cursor.parent.parentKey;
            cursor = items.find(i => i.key === pageId) ?? cursor;
        }
        return [
            item.key,
            pageId,
            item.parent?.parentKey === "root" ? null : item.parent?.parentKey ?? null,
            String(v.get("text") ?? ""),
            due ?? null,
            Boolean(v.get("done")),
            v.get("tags") ?? null,
            Boolean(v.get("allDay")),
            v.get("startOn") ?? null,
            start ?? null,
            v.get("duration") ?? null,
            v.get("rrule") ?? null,
            v.get("recurrenceDtstart") ?? null,
            v.get("recurrenceTimezone") ?? null,
            v.get("recurrenceParentId") ?? null,
            v.get("recurrenceOccurrenceId") ?? null,
        ];
    });
}
function snapshot(doc: Y.Doc, entry: { toJSON(): unknown; }, tables: readonly TableInput[]) {
    return revision([
        Buffer.from(Y.encodeStateVector(doc)).toString("base64url"),
        entry.toJSON(),
        tables.map(t => [t.id, Buffer.from(Y.encodeStateVector(t.doc)).toString("base64url")]),
    ]);
}
function revision(value: unknown) {
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}
function releaseAll(host: LiveRoomHost, project: DirectConnection, sources: ReadonlyMap<string, DirectConnection>) {
    let done = false;
    return async () => {
        if (done) return;
        done = true;
        let error: unknown;
        for (const connection of [...sources.values(), project]) {
            try {
                await closeLiveRoom(host, connection);
            } catch (e) {
                error ??= e;
            }
        }
        if (error) throw error;
    };
}
function isMissingRelation(error: unknown) {
    return error instanceof Error && /relation .* does not exist/i.test(error.message);
}
