import type * as Y from "yjs";
import { getKanban, getKanbanRegistry, type KanbanHandles, type KanbanLaneValue } from "./kanbanDocs";
import {
    analyzeProjectQueryProvenance,
    type ProjectQueryProvenance,
    unambiguousPhysicalColumn,
} from "./projectQueryProvenance";
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
    sourceIdentity?: { kind?: string; id: string; supplierId?: string; };
    row: Record<string, unknown>;
    /** Result-column revisions captured from the actual supplier at execution. */
    writeRevisions?: Record<string, string>;
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
    private resolvedSchemas = new Map<string, ParsedTableSchema>();
    private pendingProjection: Promise<void> = Promise.resolve();
    /** Last successful SELECT owned by the session, independent of view diagnostics. */
    private selectEvidence: ProjectSelectEvidence | undefined;
    private definitionGeneration = 0;
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
                this.definitionGeneration++;
                this.publish(this.fail("unavailable", "Kanban definition is missing"));
            }
        };
    }
    get sourceSchema() {
        return this.resolvedSourceSchema;
    }
    columnSchema(card: KanbanCard, output: string) {
        const kind = card.sourceIdentity?.kind;
        const analysis = this.projection.provenance?.analysis;
        if (!kind || analysis?.status !== "proven") return undefined;
        const physical = unambiguousPhysicalColumn(analysis, kind, output);
        return physical ? this.resolvedSchemas.get(kind)?.columns.find(column => column.name === physical) : undefined;
    }
    schemaForSource(kind: string) {
        return this.resolvedSchemas.get(kind);
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
        const definitionGeneration = ++this.definitionGeneration;
        const s = getKanban(this.options.projectDoc, this.options.kanbanId);
        if (!s) return this.publish(this.fail("unavailable", "Kanban definition is missing"));
        this.markStale();
        this.session.setQuery(s.query);
        if (!s.query.trim() || !s.groupField) {
            this.publish(this.fail("incomplete", "Kanban query and grouping column are required"));
        } else if (this.selectEvidence && this.session.isEvidenceCurrent(this.selectEvidence)) {
            this.pendingProjection = this.project(this.selectEvidence, definitionGeneration);
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
        if (state.status === "success") {
            this.selectEvidence = state.evidence;
            this.pendingProjection = this.project(state.evidence, this.definitionGeneration);
        }
    }
    private async project(e: ProjectSelectEvidence, definitionGeneration = this.definitionGeneration) {
        if (definitionGeneration !== this.definitionGeneration) return;
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
        const schemas = new Map<string, ParsedTableSchema>();
        const providers = new Map<string, Awaited<ReturnType<ProjectSelectSession["resolveRelation"]>>>();
        await Promise.all(analysis.suppliers.map(async source => {
            const provider = await this.session.resolveRelation(source.sqlName);
            providers.set(source.sqlName, provider);
            const schema = provider?.schema;
            if (schema) schemas.set(source.sqlName, schema);
        }));
        if (!this.session.isEvidenceCurrent(e) || definitionGeneration !== this.definitionGeneration) return;
        for (const cards of by.values()) {
            for (const card of cards) {
                const kind = card.sourceIdentity?.kind;
                const id = card.sourceIdentity?.id;
                const provider = kind ? providers.get(kind) : undefined;
                if (card.sourceIdentity && provider?.evidence) {
                    card.sourceIdentity.supplierId = provider.evidence.id;
                }
                if (!kind || !id || !provider?.existingRowWriteRevision) continue;
                const revisions: Record<string, string> = {};
                for (const output of columns) {
                    const physical = unambiguousPhysicalColumn(analysis, kind, output);
                    if (physical) revisions[output] = provider.existingRowWriteRevision(id, physical);
                }
                card.writeRevisions = revisions;
            }
        }
        this.resolvedSchemas = schemas;
        const schema = supplier ? schemas.get(supplier.sqlName) : undefined;
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
        if (definitionGeneration !== this.definitionGeneration) return;
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
        const b = p.branches.every(x => x.claimedSourceKind !== undefined)
                && claiming.length > 0 && claiming.every(x => x.routedIdentity)
            ? claiming.find(x => x.source.sqlName === row.source_kind)
            : undefined;
        return b ? { kind: b.source.sqlName, id: row.source_id } : undefined;
    }
    return p.bareIdSource && typeof row.id === "string" ? { kind: p.bareIdSource.sqlName, id: row.id } : undefined;
}
