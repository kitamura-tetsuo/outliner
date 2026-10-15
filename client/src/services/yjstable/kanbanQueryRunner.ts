import type * as Y from "yjs";
import { getKanban, getKanbanRegistry, type KanbanHandles, type KanbanLaneValue } from "./kanbanDocs";
import { analyzeProjectQueryProvenance, type ProjectQueryProvenance } from "./projectQueryProvenance";
import {
    createProjectSelectSession,
    type ProjectSelectEvidence,
    type ProjectSelectSession,
    type ProjectSelectState,
} from "./projectSelectSession";
import type { ParsedTableSchema } from "./schemaIntrospection";
import type { TableDocConnector } from "./tableEngine";
import type { RelationRegistryPort } from "./tableEngine";
import type { TableQueryExecution } from "./tableQueryRunner";
import type { TableQueryResult } from "./tableSyncAdapter";

export type KanbanResultStatus = "loading" | "incomplete" | "success" | "invalid" | "unavailable" | "error";
export interface KanbanCard {
    occurrenceKey: string;
    sourceIdentity?: { kind?: string; id: string; };
    row: Record<string, unknown>;
}
export interface KanbanLane {
    key: KanbanLaneValue;
    cards: KanbanCard[];
}
export interface KanbanExecutionProvenance {
    kanbanId: string;
    query: string;
    evidence?: ProjectSelectEvidence;
    analysis?: ProjectQueryProvenance;
    execution: TableQueryExecution;
    schemaSql?: string;
    sourceSqlName?: string;
}
export interface KanbanProjection {
    status: KanbanResultStatus;
    lanes: KanbanLane[];
    columns: string[];
    evidence?: ProjectSelectEvidence;
    result?: TableQueryResult;
    provenance?: KanbanExecutionProvenance;
    message?: string;
    current: boolean;
}
export interface KanbanRunnerOptions {
    projectDoc: Y.Doc;
    projectId?: string;
    kanbanId: string;
    kanban: KanbanHandles;
    connect?: TableDocConnector;
    registry?: RelationRegistryPort;
}

export class KanbanQueryRunner {
    private listeners = new Set<(p: KanbanProjection) => void>();
    private projection: KanbanProjection = { status: "loading", lanes: [], columns: [], current: false };
    private resolvedSourceSchema: ParsedTableSchema | undefined;
    private pendingProjection: Promise<void> = Promise.resolve();
    private session: ProjectSelectSession;
    private unsub?: () => void;
    private registryObserver: (e: Y.YMapEvent<Y.Map<unknown>>) => void;
    constructor(private options: KanbanRunnerOptions) {
        const query = getKanban(options.projectDoc, options.kanbanId)?.query ?? "";
        this.session = createProjectSelectSession({
            projectDoc: options.projectDoc,
            projectId: options.projectId ?? options.projectDoc.guid,
            query,
            connect: options.connect,
            registry: options.registry,
            requireExplicitAliases: false,
        });
        this.registryObserver = e => {
            if (e.changes.keys.has(options.kanbanId) && !getKanban(options.projectDoc, options.kanbanId)) {
                this.publish(this.fail("unavailable", "Kanban definition is missing"));
            }
        };
    }
    get sourceSchema() {
        return this.resolvedSourceSchema;
    }
    subscribeProjection(fn: (p: KanbanProjection) => void) {
        this.listeners.add(fn);
        fn(this.projection);
        return () => this.listeners.delete(fn);
    }
    start() {
        if (this.unsub) return;
        this.options.kanban.entry.observeDeep(this.definitionObserver);
        getKanbanRegistry(this.options.projectDoc).observe(this.registryObserver);
        const current = getKanban(this.options.projectDoc, this.options.kanbanId);
        if (current) this.session.setQuery(current.query);
        this.unsub = this.session.subscribe(s => this.consume(s));
    }
    async runQueryNow() {
        const evidence = await this.session.runNow();
        if (evidence) await this.pendingProjection;
        return evidence;
    }
    dispose() {
        this.unsub?.();
        this.unsub = undefined;
        this.options.kanban.entry.unobserveDeep(this.definitionObserver);
        getKanbanRegistry(this.options.projectDoc).unobserve(this.registryObserver);
        this.session.dispose();
    }
    isEvidenceCurrent(e: ProjectSelectEvidence) {
        return this.session.isEvidenceCurrent(e);
    }
    private definitionObserver = () => {
        const s = getKanban(this.options.projectDoc, this.options.kanbanId);
        if (!s) return this.publish(this.fail("unavailable", "Kanban definition is missing"));
        this.markStale();
        this.session.setQuery(s.query);
        if (!s.query.trim() || !s.groupField) {
            this.publish(this.fail("incomplete", "Kanban query and grouping column are required"));
        }
    };
    private consume(state: ProjectSelectState) {
        if (state.status === "loading") return this.markStale(true);
        if (state.status === "incomplete") {
            return this.publish(this.fail("incomplete", "Kanban query and grouping column are required"));
        }
        if (state.status === "unavailable") {
            return this.publish(this.fail("unavailable", `Kanban query source is missing: ${state.relation}`));
        }
        if (state.status === "error") {
            return this.publish({ status: "error", message: state.message, lanes: [], columns: [], current: false });
        }
        if (state.status === "success") this.pendingProjection = this.project(state.evidence);
    }
    private async project(e: ProjectSelectEvidence) {
        const s = getKanban(this.options.projectDoc, this.options.kanbanId);
        if (!s) return this.publish(this.fail("unavailable", "Kanban definition is missing"));
        if (!s.query.trim() || !s.groupField) {
            return this.publish(this.fail("incomplete", "Kanban query and grouping column are required"));
        }
        const columns = e.columns.map(c => c.name);
        const groupMatches = columns.filter(column => column === s.groupField).length;
        if (groupMatches !== 1) {
            return this.publish(this.fail(
                "invalid",
                groupMatches
                    ? `Grouping result column "${s.groupField}" is duplicated`
                    : `Grouping result column "${s.groupField}" is missing`,
            ));
        }
        const analysis = analyzeProjectQueryProvenance(e),
            by = new Map<KanbanLaneValue, KanbanCard[]>(),
            seen: KanbanLaneValue[] = [];
        for (let i = 0; i < e.rows.length; i++) {
            const row = e.rows[i]!, k = row[s.groupField];
            if (k !== null && typeof k !== "string") {
                return this.publish(this.fail("invalid", "Grouping values must be strings or SQL NULL"));
            }
            const key = k as KanbanLaneValue;
            if (!by.has(key)) {
                by.set(key, []);
                seen.push(key);
            }
            by.get(key)!.push({ occurrenceKey: `${e.queryId}:${i}`, sourceIdentity: identity(row, analysis), row });
        }
        for (const field of [s.titleField, ...s.detailFields].filter((value): value is string => !!value)) {
            const matches = columns.filter(column => column === field).length;
            if (matches !== 1) {
                return this.publish(this.fail(
                    "invalid",
                    matches
                        ? `Configured result column "${field}" is duplicated`
                        : `Configured result column "${field}" is missing`,
                ));
            }
        }
        const supplier = analysis.bareIdSource;
        const schema = supplier ? (await this.session.resolveRelation(supplier.sqlName))?.schema : undefined;
        if (!this.session.isEvidenceCurrent(e)) return;
        this.resolvedSourceSchema = schema;
        const groupRoute = analysis.branches.length === 1
            ? analysis.branches[0]?.columns.find(column => column.outputColumn === s.groupField)
            : undefined;
        const groupColumn = groupRoute && groupRoute.source.sqlName === supplier?.sqlName
            ? schema?.columns.find(column => column.name === groupRoute.physicalColumn)
            : undefined;
        const declared: KanbanLaneValue[] = groupColumn?.kind === "text"
            ? [...(groupColumn.enumLabels ?? groupColumn.checkOptions ?? [])]
            : [];
        const eligible = [...declared, ...seen.filter(key => !declared.includes(key))];
        const preferred = s.laneOrder.filter(k => eligible.includes(k));
        const order = [...preferred, ...eligible.filter(k => !preferred.includes(k))];
        this.publish({
            status: "success",
            lanes: order.map(key => ({ key, cards: by.get(key) ?? [] })),
            columns,
            evidence: e,
            result: { columns, rows: e.rows },
            current: true,
            provenance: {
                kanbanId: this.options.kanbanId,
                query: e.query,
                evidence: e,
                analysis,
                execution: {
                    queryId: e.queryId,
                    generation: e.executionGeneration,
                    query: e.query,
                    status: "completed",
                    startedAt: "",
                    durationMs: 0,
                    rowCount: e.rows.length,
                    columnCount: columns.length,
                },
                sourceSqlName: supplier?.sqlName,
            },
        });
    }
    private markStale(loading = false) {
        if (this.projection.current) this.publish({ ...this.projection, current: false });
        else if (loading && this.projection.status === "loading") this.publish(this.projection);
    }
    private fail(status: "incomplete" | "invalid" | "unavailable", message: string): KanbanProjection {
        return { status, message, lanes: [], columns: [], current: false };
    }
    private publish(p: KanbanProjection) {
        this.projection = p;
        for (const l of this.listeners) l(p);
    }
}
function identity(row: Record<string, unknown>, p: ProjectQueryProvenance): KanbanCard["sourceIdentity"] {
    if (typeof row.source_kind === "string" && typeof row.source_id === "string") {
        const claiming = p.branches.filter(x => x.claimedSourceKind === row.source_kind);
        const b = claiming.length > 0 && claiming.every(x => x.routedIdentity)
            ? claiming.find(x => x.source.sqlName === row.source_kind)
            : undefined;
        return b ? { kind: b.source.sqlName, id: row.source_id } : undefined;
    }
    return p.bareIdSource && typeof row.id === "string" ? { kind: p.bareIdSource.sqlName, id: row.id } : undefined;
}
