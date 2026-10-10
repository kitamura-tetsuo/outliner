import type * as Y from "yjs";
import { getKanban, getKanbanRegistry, type KanbanHandles, type KanbanLaneValue } from "./kanbanDocs";
import { resolveBareIdMutationAuthority } from "./queryAnalysis";
import { getTableRegistry, getTableSqlName } from "./tableDocs";
import { type TableQueryExecution, TableQueryRunnerBase, type TableRunnerOptions } from "./tableQueryRunner";
import type { TableQueryResult } from "./tableSyncAdapter";

export type KanbanResultStatus = "loading" | "incomplete" | "success" | "invalid" | "unavailable" | "error";

export interface KanbanCard {
    /** Unique for this returned occurrence, including duplicate SQL rows. */
    occurrenceKey: string;
    /** Durable source identity when the SELECT retained one. */
    sourceIdentity?: { kind?: string; id: string; };
    row: Record<string, unknown>;
}

export interface KanbanLane {
    /** A typed key; SQL NULL never aliases a string value. */
    key: KanbanLaneValue;
    cards: KanbanCard[];
}

export interface KanbanExecutionProvenance {
    kanbanId: string;
    sourceTableId: string;
    sourceSqlName: string;
    query: string;
    schemaSql: string;
    execution: TableQueryExecution;
}

export interface KanbanProjection {
    status: KanbanResultStatus;
    lanes: KanbanLane[];
    columns: string[];
    result?: TableQueryResult;
    provenance?: KanbanExecutionProvenance;
    message?: string;
    /** False for a retained display after its inputs have been invalidated. */
    current: boolean;
}

export interface KanbanRunnerOptions extends TableRunnerOptions {
    projectDoc: Y.Doc;
    kanbanId: string;
    kanban: KanbanHandles;
}

/**
 * Executes and projects one Kanban definition without creating Grid state.
 * The base runner supplies the same validation, relation resolution,
 * materialization and stale-generation guard used by Grid.
 */
export class KanbanQueryRunner extends TableQueryRunnerBase {
    private readonly projectDoc: Y.Doc;
    private readonly kanbanId: string;
    private readonly kanban: KanbanHandles;
    private readonly sourceTableId: string;
    private readonly projectionListeners = new Set<(projection: KanbanProjection) => void>();
    private projection: KanbanProjection = { status: "loading", lanes: [], columns: [], current: false };
    private unsubscribeResult: (() => void) | undefined;

    private readonly definitionObserver = () => {
        this.markNonCurrent();
        this.invalidateQuery();
    };
    private readonly tableRegistryObserver = () => {
        this.invalidateQuery();
    };
    private readonly kanbanRegistryObserver = (event: Y.YMapEvent<Y.Map<unknown>>) => {
        if (!event.changes.keys.has(this.kanbanId)) return;
        this.markNonCurrent();
        if (!getKanban(this.projectDoc, this.kanbanId)) {
            this.publish(this.failure("unavailable", "Kanban definition is missing"));
        } else this.invalidateQuery();
    };

    constructor(options: KanbanRunnerOptions) {
        super(options);
        this.projectDoc = options.projectDoc;
        this.kanbanId = options.kanbanId;
        this.kanban = options.kanban;
        this.sourceTableId = getKanban(this.projectDoc, this.kanbanId)?.sourceTableId ?? "";
    }

    protected currentQuery(): string {
        return getKanban(this.projectDoc, this.kanbanId)?.query ?? "";
    }

    protected observeQuerySource(): void {
        this.kanban.entry.observeDeep(this.definitionObserver);
        getKanbanRegistry(this.projectDoc).observe(this.kanbanRegistryObserver);
        getTableRegistry(this.projectDoc).observeDeep(this.tableRegistryObserver);
    }

    protected unobserveQuerySource(): void {
        this.kanban.entry.unobserveDeep(this.definitionObserver);
        getKanbanRegistry(this.projectDoc).unobserve(this.kanbanRegistryObserver);
        getTableRegistry(this.projectDoc).unobserveDeep(this.tableRegistryObserver);
    }

    subscribeProjection(listener: (projection: KanbanProjection) => void): () => void {
        this.projectionListeners.add(listener);
        listener(this.projection);
        return () => this.projectionListeners.delete(listener);
    }

    start(): void {
        if (!this.unsubscribeResult) {
            this.unsubscribeResult = this.subscribe({
                onResult: (result, execution) => this.projectResult(result, execution),
                onError: message => {
                    if (message) this.publish({ ...this.projection, status: "error", message, current: false });
                },
            });
        }
        super.start();
    }

    dispose(): void {
        this.unsubscribeResult?.();
        this.unsubscribeResult = undefined;
        super.dispose();
    }

    private markNonCurrent(): void {
        if (this.projection.current) this.publish({ ...this.projection, current: false });
    }

    protected onInputsInvalidated(): void {
        this.markNonCurrent();
    }

    private projectResult(result: TableQueryResult, execution?: TableQueryExecution): void {
        const settings = getKanban(this.projectDoc, this.kanbanId);
        if (!settings) return this.publish(this.failure("unavailable", "Kanban definition is missing"));
        if (settings.sourceTableId !== this.sourceTableId) {
            return this.publish(
                this.failure("unavailable", "Kanban source Table changed; reacquire its Table engine adapter"),
            );
        }
        if (!getTableRegistry(this.projectDoc).has(settings.sourceTableId)) {
            return this.publish(this.failure("unavailable", "Kanban source Table is missing"));
        }
        if (!settings.query.trim() || !settings.groupField) {
            return this.publish(this.failure("incomplete", "Kanban query and grouping column are required"));
        }
        if (!this.sourceAdapter.appliedSchema) {
            return this.publish(this.failure("invalid", "Kanban source schema is unavailable"));
        }
        if (!execution || execution.status !== "completed") return;
        const matches = result.columns.filter(column => column === settings.groupField).length;
        if (matches !== 1) {
            return this.publish(this.failure(
                "invalid",
                matches === 0
                    ? `Grouping result column "${settings.groupField}" is missing`
                    : `Grouping result column "${settings.groupField}" is duplicated`,
            ));
        }

        const cardsByKey = new Map<KanbanLaneValue, KanbanCard[]>();
        const observedOrder: KanbanLaneValue[] = [];
        for (let index = 0; index < result.rows.length; index++) {
            const row = result.rows[index];
            const key = row[settings.groupField] as unknown;
            if (key !== null && typeof key !== "string") {
                return this.publish(this.failure("invalid", "Grouping values must be strings or SQL NULL"));
            }
            const laneKey = key as KanbanLaneValue;
            let cards = cardsByKey.get(laneKey);
            if (!cards) {
                cards = [];
                cardsByKey.set(laneKey, cards);
                observedOrder.push(laneKey);
            }
            cards.push({
                occurrenceKey: `${execution.queryId}:${index}`,
                sourceIdentity: sourceIdentity(row),
                row,
            });
        }

        const schema = this.sourceAdapter.appliedSchema;
        const sqlName = getTableSqlName(this.projectDoc, settings.sourceTableId) ?? "";
        const authority = resolveBareIdMutationAuthority(settings.query, sqlName, schema, result.columns);
        const groupSchema = schema.columns.find(column => column.name === settings.groupField);
        const declared = authority.status === "compatible"
                && authority.editableColumns.has(settings.groupField)
                && groupSchema?.kind === "text"
                && groupSchema.checkOptions
            ? groupSchema.checkOptions
            : [];
        const eligible: KanbanLaneValue[] = [...declared];
        for (const key of observedOrder) if (!eligible.includes(key)) eligible.push(key);
        const preferred = settings.laneOrder.filter(key => eligible.includes(key));
        const ordered = [...preferred, ...eligible.filter(key => !preferred.includes(key))];
        const lanes = ordered.map(key => ({ key, cards: cardsByKey.get(key) ?? [] }));
        this.publish({
            status: "success",
            lanes,
            columns: [...result.columns],
            result,
            current: true,
            provenance: {
                kanbanId: this.kanbanId,
                sourceTableId: settings.sourceTableId,
                sourceSqlName: sqlName,
                query: execution.query,
                schemaSql: schema.createSql,
                execution,
            },
        });
    }

    private failure(
        status: Exclude<KanbanResultStatus, "loading" | "success" | "error">,
        message: string,
    ): KanbanProjection {
        return { status, message, lanes: [], columns: [], current: false };
    }

    private publish(projection: KanbanProjection): void {
        this.projection = projection;
        for (const listener of this.projectionListeners) listener(projection);
    }
}

function sourceIdentity(row: Record<string, unknown>): KanbanCard["sourceIdentity"] {
    if (typeof row.source_kind === "string" && typeof row.source_id === "string") {
        return { kind: row.source_kind, id: row.source_id };
    }
    return typeof row.id === "string" ? { id: row.id } : undefined;
}
