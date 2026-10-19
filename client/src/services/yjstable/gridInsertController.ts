import type * as Y from "yjs";
import { canReplayProjectHistory } from "../undo/projectHistoryAuthorization";
import { getGridRegistry } from "./gridDocs";
import {
    type InsertTargetMode,
    type InsertTargetResolution,
    resolveInsertTarget,
    validateInsertTargetPreference,
} from "./insertTargetResolver";
import { analyzeProjectQueryProvenance } from "./projectQueryProvenance";
import { createProjectSelectSession, type ProjectSelectEvidence } from "./projectSelectSession";
import type { RelationProvider, RelationValue } from "./relationProvider";
import type { TableColumnSchema } from "./schemaIntrospection";
import { getTableHandles, getTableSqlName, listTables } from "./tableDocs";
import { createTableEngineSession, type TableDocConnector } from "./tableEngine";
import { castValueForColumn } from "./valueCasting";

declare global {
    // Timing instrumentation only: never substitutes proof, permission or writer.
    var __GRID_INSERT_TEST_CONTROL__: { beforeAcquire: (targetId: string) => Promise<void>; } | undefined;
}

export interface GridInsertState {
    loading: boolean;
    pending: boolean;
    preference?: string;
    resolution?: InsertTargetResolution;
    candidates: { id: string; name: string; sqlName: string; }[];
}

export type GridInsertOutcome =
    | {
        status: "inserted";
        targetId: string;
        targetSqlName: string;
        rowId?: string;
        visibility: "pending" | "represented" | "outside";
    }
    | { status: "refused"; mode: InsertTargetMode | "invalid-record" | "stale"; message: string; }
    | { status: "error"; targetId: string; targetSqlName: string; message: string; };

export interface GridInsertController {
    readonly state: GridInsertState;
    subscribe(listener: (state: GridInsertState) => void): () => void;
    savePreference(tableId: string | undefined): Promise<string | undefined>;
    submit(): Promise<GridInsertOutcome>;
    setQuery(query: string): void;
    dispose(): void;
}

/**
 * Executes one Grid INSERT from fresh Project SELECT authority.  The controller
 * deliberately keeps no durable write handle: every submitted intent proves
 * the query, supplier, capability, Table identity and applied schema again.
 */
export function createGridInsertController(options: {
    projectDoc: Y.Doc;
    projectId?: string;
    gridEntry: Y.Map<unknown>;
    query: string;
    connect?: TableDocConnector;
    canWrite?: () => boolean;
    /** Consumer history boundary, after final validation and before the INSERT effect. */
    onBeforeEffects?: () => void;
    onPreferenceChange?: (tableId: string | undefined) => void;
}): GridInsertController {
    const select = createProjectSelectSession({
        projectDoc: options.projectDoc,
        projectId: options.projectId,
        query: options.query,
        connect: options.connect,
        requireExplicitAliases: false,
    });
    const engine = createTableEngineSession(options);
    let queryRevision = 0;
    let preferenceRevision = 0;
    let query = options.query;
    let disposed = false;
    let pending: Promise<GridInsertOutcome> | undefined;
    const gridId = [...getGridRegistry(options.projectDoc)].find(([, entry]) => entry === options.gridEntry)?.[0];
    let state: GridInsertState = { loading: true, pending: false, candidates: [] };
    const listeners = new Set<(state: GridInsertState) => void>();
    let publication = 0;
    let observedEvidence: ProjectSelectEvidence | undefined;
    let catalogRevision = 0;
    // Creating an absent, unversioned catalog root would change its semantics.
    // Listen to actual catalog transactions without materializing that root.
    const catalogObserver = (_update: Uint8Array, _origin: unknown, _doc: Y.Doc, transaction: Y.Transaction) => {
        const catalog = options.projectDoc.share.get("sqlCatalog");
        if (catalog && transaction.changedParentTypes.has(catalog)) catalogRevision++;
    };
    options.projectDoc.on("update", catalogObserver);
    const schemaWatches = new Map<Y.Text, { revision: number; observer: () => void; }>();
    function snapshotSchemas() {
        return new Map(
            listTables(options.projectDoc).map(table => {
                const text = getTableHandles(options.projectDoc, table.tableId)?.schemaText;
                if (!text) return [table.tableId, undefined] as const;
                let watch = schemaWatches.get(text);
                if (!watch) {
                    const added = {
                        revision: 0,
                        observer: () => {
                            added.revision++;
                        },
                    };
                    text.observe(added.observer);
                    schemaWatches.set(text, added);
                    watch = added;
                }
                return [table.tableId, { text, value: text.toString(), revision: watch.revision }] as const;
            }),
        );
    }
    function publish(next: GridInsertState) {
        if (disposed) return;
        state = { ...next, pending: pending !== undefined, preference: readPreference(options.gridEntry) };
        for (const listener of listeners) listener(state);
    }
    async function refresh() {
        const generation = ++publication;
        try {
            await refreshCurrent(generation);
        } catch (error) {
            if (generation === publication) {
                publish({
                    loading: false,
                    pending: false,
                    candidates: [],
                    resolution: {
                        mode: "unavailable",
                        reason: error instanceof Error ? error.message : "INSERT evidence is unavailable",
                    },
                });
            }
        }
    }
    async function refreshCurrent(generation: number) {
        const current = select.state;
        if (current.status !== "success") {
            publish({
                loading: current.status === "loading",
                pending: false,
                candidates: [],
                resolution: {
                    mode: "unavailable",
                    reason: "message" in current ? current.message : "Current supplier evidence is unavailable",
                },
            });
            return;
        }
        const evidence = current.evidence;
        publish({ ...state, loading: true });
        const provenance = analyzeProjectQueryProvenance(evidence);
        const resolver = {
            projectDoc: options.projectDoc,
            evidence,
            provenance,
            session: select,
            resolveRelation: (name: string) => engine.resolveRelation(name),
        };
        const resolution = await resolveInsertTarget({
            ...resolver,
            insertTargetTableId: readPreference(options.gridEntry),
        });
        const candidates: GridInsertState["candidates"] = [];
        for (const supplier of provenance.suppliers) {
            if (supplier.kind !== "table") continue;
            const checked = await validateInsertTargetPreference(resolver, supplier.id);
            if (!checked.valid || checked.resolution.target?.requiresDestination) continue;
            const table = listTables(options.projectDoc).find(table => table.tableId === supplier.id);
            if (table) candidates.push({ id: supplier.id, name: table.name, sqlName: supplier.sqlName });
        }
        if (generation !== publication || !select.isEvidenceCurrent(evidence)) return;
        observedEvidence = evidence;
        publish({ loading: false, pending: false, candidates: stale() ? [] : candidates, resolution });
    }
    const observer = (event: Y.YMapEvent<unknown>) => {
        if (event.keysChanged.has("query")) queryRevision++;
        if (event.keysChanged.has("insertTargetTableId")) preferenceRevision++;
        void refresh();
    };
    options.gridEntry.observe(observer);
    const unsubscribe = select.subscribe(() => void refresh());

    const submit = (): Promise<GridInsertOutcome> => {
        if (pending) return pending;
        const capturedTarget = state.resolution?.target?.id;
        const intent = execute(capturedTarget, observedEvidence).catch(error =>
            refused("unavailable", error instanceof Error ? error.message : "Insertion preparation failed")
        ).finally(() => {
            if (pending === intent) pending = undefined;
            publish(state);
        });
        pending = intent;
        publish(state);
        return intent;
    };

    function currentEvidence(): ProjectSelectEvidence | undefined {
        const current = select.state;
        return current.status === "success" && select.isEvidenceCurrent(current.evidence)
            ? current.evidence
            : undefined;
    }

    async function execute(
        capturedTarget?: string,
        capturedEvidence?: ProjectSelectEvidence,
    ): Promise<GridInsertOutcome> {
        if (disposed) return refused("stale", "The Grid insertion controller is no longer active");
        const capturedQueryRevision = queryRevision;
        const capturedPreferenceRevision = preferenceRevision;
        const capturedCatalogRevision = catalogRevision;
        const capturedSchemas = snapshotSchemas();
        const preference = readPreference(options.gridEntry);
        const evidence = currentEvidence() ?? await select.runNow();
        if (!evidence || stale()) return refused("stale", "The query changed while preparing the insertion");
        if (
            capturedEvidence && (capturedEvidence.catalogGeneration !== evidence.catalogGeneration
                || capturedEvidence.catalogRevision !== evidence.catalogRevision
                || JSON.stringify(capturedEvidence.sources) !== JSON.stringify(evidence.sources))
        ) {
            return refused("stale", "The source or catalog changed after submission");
        }
        const provenance = analyzeProjectQueryProvenance(evidence);
        let provider: RelationProvider | undefined;
        const resolution = await resolveInsertTarget({
            projectDoc: options.projectDoc,
            evidence,
            provenance,
            insertTargetTableId: preference,
            session: select,
            resolveRelation: async sqlName => provider = await engine.resolveRelation(sqlName),
        });
        if (!resolution.target || !provider) {
            return refused(resolution.mode, resolution.reason ?? insertionMessage(resolution.mode));
        }
        const target = resolution.target;
        if (capturedTarget !== undefined && target.id !== capturedTarget) {
            return refused("stale", "The INSERT destination changed after submission");
        }
        if (target.kind !== "table" || target.requiresDestination) {
            return refused("unsupported", "This supplier cannot accept a destination-free Grid insertion");
        }
        if (import.meta.env.MODE !== "production") {
            await globalThis.__GRID_INSERT_TEST_CONTROL__?.beforeAcquire(target.id);
        }
        const acquired = await engine.acquire(target.id);
        const schema = acquired?.adapter.appliedSchema;
        if (!acquired || !schema || schema.tableName !== target.sqlName) {
            return refused("unavailable", "The resolved Table schema is unavailable");
        }
        const schemaRevision = acquired.handles.schemaText.toString();
        if (schemaRevision !== provenance.suppliers.find(source => source.id === target.id)?.schemaRevision) {
            return refused("stale", "The resolved Table schema changed while preparing the insertion");
        }
        const values = buildInsertValues(schema.columns);
        if (!values) return refused("invalid-record", "The Table has no supported default insertion plan");
        // This is the final authority check before the first and only write.
        if (
            stale() || !select.isEvidenceCurrent(evidence)
            || queryRevision !== capturedQueryRevision || preferenceRevision !== capturedPreferenceRevision
            || catalogRevision !== capturedCatalogRevision
            || readPreference(options.gridEntry) !== preference
            || getTableSqlName(options.projectDoc, target.id) !== target.sqlName
            || capturedSchemas.get(target.id)?.value !== schemaRevision
            || capturedSchemas.get(target.id)?.text !== acquired.handles.schemaText
            || schemaWatches.get(acquired.handles.schemaText)?.revision !== capturedSchemas.get(target.id)?.revision
            || acquired.handles.schemaText.toString() !== schemaRevision
            || provider.evidence?.id !== target.id || provider.evidence.schemaRevision !== schemaRevision
            || !provider.capabilities.insert || provider.capabilities.insert.requiresDestination
        ) return refused("stale", "The query, destination, schema, or permission changed before insertion");
        try {
            options.onBeforeEffects?.();
            const receipt = await provider.applyWrite({ op: "INSERT", values });
            let visibility: "pending" | "represented" | "outside" = "pending";
            // Failure to refresh a result cannot undo a committed source write.
            try {
                const current = await select.runNow();
                if (
                    receipt && current && !stale() && queryRevision === capturedQueryRevision
                    && select.isEvidenceCurrent(current)
                ) {
                    const proof = analyzeProjectQueryProvenance(current);
                    const targetBranches = proof.branches.filter(branch => branch.source.id === target.id);
                    const identified = proof.status === "proven" && (proof.bareIdSource?.id === target.id
                        || (targetBranches.length > 0 && targetBranches.every(branch => branch.routedIdentity)));
                    const represented = current.rowIdentities.some(row =>
                        proof.bareIdSource?.id === target.id
                            ? row.id === receipt.insertedRowId
                            : row.sourceKind === target.sqlName && row.sourceId === receipt.insertedRowId
                    );
                    if (identified) visibility = represented ? "represented" : "outside";
                }
            } catch { /* Source success remains authoritative. */ }
            return {
                status: "inserted",
                targetId: target.id,
                targetSqlName: target.sqlName,
                rowId: receipt?.insertedRowId,
                visibility,
            };
        } catch (error) {
            return {
                status: "error",
                targetId: target.id,
                targetSqlName: target.sqlName,
                message: error instanceof Error ? error.message : "The provider rejected the insertion",
            };
        }
    }

    function stale(): boolean {
        return disposed || !canReplayProjectHistory(options.projectDoc) || options.canWrite?.() === false
            || gridId === undefined || getGridRegistry(options.projectDoc).get(gridId) !== options.gridEntry
            || query !== String(options.gridEntry.get("query") ?? "");
    }

    return {
        get state() {
            return state;
        },
        subscribe(listener) {
            listeners.add(listener);
            listener(state);
            return () => listeners.delete(listener);
        },
        async savePreference(tableId) {
            if (stale() || !options.onPreferenceChange) return "The Grid is no longer writable";
            const revision = queryRevision;
            const preference = preferenceRevision;
            const catalogAtSubmission = catalogRevision;
            if (tableId !== undefined) {
                const evidence = currentEvidence() ?? await select.runNow();
                if (!evidence) return "Current supplier evidence is unavailable";
                const checked = await validateInsertTargetPreference({
                    projectDoc: options.projectDoc,
                    evidence,
                    provenance: analyzeProjectQueryProvenance(evidence),
                    session: select,
                    resolveRelation: name => engine.resolveRelation(name),
                }, tableId);
                if (!checked.valid || checked.resolution.target?.requiresDestination) {
                    return "Choose a current permitted row-supplying Table";
                }
                const supplier = analyzeProjectQueryProvenance(evidence).suppliers.find(source =>
                    source.id === tableId
                );
                if (
                    !supplier || getTableSqlName(options.projectDoc, tableId) !== supplier.sqlName
                    || getTableHandles(options.projectDoc, tableId)?.schemaText.toString() !== supplier.schemaRevision
                ) {
                    return "The destination changed before saving";
                }
                if (!select.isEvidenceCurrent(evidence)) return "The query or destination changed before saving";
            }
            if (
                stale() || revision !== queryRevision || preference !== preferenceRevision
                || catalogAtSubmission !== catalogRevision
            ) {
                return "The Grid changed before saving";
            }
            options.onPreferenceChange(tableId);
            return undefined;
        },
        submit,
        setQuery(next) {
            if (next === query) return;
            query = next;
            select.setQuery(next);
            void refresh();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            publication++;
            unsubscribe();
            listeners.clear();
            options.projectDoc.off("update", catalogObserver);
            for (const [text, watch] of schemaWatches) text.unobserve(watch.observer);
            schemaWatches.clear();
            options.gridEntry.unobserve(observer);
            select.dispose();
            engine.dispose();
        },
    };
}

function readPreference(entry: Y.Map<unknown>): string | undefined {
    const value = entry.get("insertTargetTableId");
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildInsertValues(columns: readonly TableColumnSchema[]): Record<string, RelationValue> | undefined {
    // addRecord owns identity and always generates a UUID string. Do not
    // publish one into an integer, too-short, or checked physical id column.
    const id = columns.find(column => column.name === "id");
    if (
        id
        && (id.kind !== "text" || !["text", "uuid", "character varying"].includes(id.dataType) || id.hasCheckConstraint
            || (id.characterMaximumLength !== undefined && id.characterMaximumLength < 36))
    ) {
        return undefined;
    }
    const values: Record<string, RelationValue> = {};
    for (const column of columns) {
        if (column.name === "id") continue;
        const choices = column.enumLabels ?? column.checkOptions;
        if (column.defaultExpression !== undefined) {
            const value = parseDefault(column.defaultExpression, column.kind);
            if (value === undefined || (choices?.length && !choices.includes(String(value)))) return undefined;
            values[column.name] = value;
        } else if (choices?.length) values[column.name] = choices[0]!;
        else if (column.isNullable) continue;
        else if (
            column.kind === "text" && column.dataType !== "uuid"
            && !column.hasCheckConstraint
        ) values[column.name] = "";
        else if (column.kind === "boolean") values[column.name] = false;
        else return undefined;
    }
    try {
        for (const column of columns) {
            if (column.name === "id") continue;
            const value = castValueForColumn(values[column.name], column);
            if (
                typeof value === "string" && column.characterMaximumLength !== undefined
                && [...value].length > column.characterMaximumLength
            ) return undefined;
            if (value === null && !column.isNullable) return undefined;
            const choices = column.enumLabels ?? column.checkOptions;
            if (value !== null && choices?.length && !choices.includes(String(value))) return undefined;
            // General SQL CHECK expressions have no supported default plan.
            if (column.hasCheckConstraint && !choices?.length && value !== null) return undefined;
        }
    } catch {
        return undefined;
    }
    return values;
}

function parseDefault(expression: string, kind: TableColumnSchema["kind"]): RelationValue | undefined {
    const quoted = expression.trim().match(/^'((?:[^']|'')*)'(?:\s*::[\s\S]+)?$/);
    if (quoted) return quoted[1]!.replace(/''/g, "'");
    const value = expression.replace(/::[\s\S]+$/u, "").trim();
    if (/^null$/i.test(value)) return null;
    if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
    if ((kind === "integer" || kind === "number") && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    return undefined;
}

function refused(mode: InsertTargetMode | "invalid-record" | "stale", message: string): GridInsertOutcome {
    return { status: "refused", mode, message };
}

function insertionMessage(mode: InsertTargetMode): string {
    if (mode === "selection-required") return "Choose an INSERT destination before adding a row";
    if (mode === "invalid-selection") return "The configured INSERT destination is not a supplier";
    return "The current query has no supported INSERT destination";
}
