import { isValidGridColumnWidth } from "$shared/services/gridDefinition";
import { readSqlCatalog } from "$shared/services/sqlCatalog";
import type { PGlite } from "@electric-sql/pglite";
import * as Y from "yjs";
import {
    type GridSnapshot,
    type GridTableSnapshot,
    type GridUiComponentDto,
    isGridSnapshotMap,
    isGridTableSnapshot,
} from "../clipboard/itemClipboard";
import { TransferBindings } from "../clipboard/transferBindings";
import {
    createGrid,
    getGridConfirmRowDelete,
    getGridHandles,
    getGridInsertTargetTableId,
    getGridRegistry,
    getGridShowAddRowButton,
} from "./gridDocs";
import { ITEMS_RELATION_CREATE_SQL } from "./itemsRelation";
import { enqueueWrite } from "./pgliteService";
import { assertSelectQuery } from "./queryAnalysis";
import { queryReadDependencies } from "./queryReadDependencies";
import { deriveSqlName } from "./sqlNames";
import { assertPortableStructuralEnumCompatibility, type StructuralEnumAdmission } from "./structuralEnumGuard";
import {
    createTable,
    getTableHandles,
    getTableName,
    getTableSqlName,
    listTables,
    removeTable,
    type TableHandles,
} from "./tableDocs";
import { rewriteCreateTableSql, rewriteTableQuerySql } from "./tableSqlRewrite";

export class TableCloneError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TableCloneError";
    }
}

/**
 * Copy a table's Data Storage as an independent snapshot. Yjs shared types
 * cannot be attached to two documents, so every record map is rebuilt in the
 * destination subdocument. The destination is replaced atomically.
 */
export function copyTableData(source: TableHandles, destination: TableHandles): void {
    destination.doc.transact(() => {
        destination.data.clear();
        source.data.forEach((sourceRecord, recordId) => {
            const destinationRecord = new Y.Map<import("./tableDocs").TableRecordValue>();
            sourceRecord.forEach((value, column) => destinationRecord.set(column, value));
            destination.data.set(recordId, destinationRecord);
        });
    });
}

export interface TableCloneResult {
    /** Immutable semantic dependency witness retained for replay admission. */
    enumAdmission: StructuralEnumAdmission;
    bindings: TransferBindings;
    /** Source table id to fresh destination table id for successful clones. */
    tableIdMap: Record<string, string>;
    /**
     * Source table id to the Grid this paste created alongside its destination
     * Table. Pasted outline items should bind to these Grid ids, not the table
     * ids, so multiple grids per Table stays a native pattern.
     */
    gridIdMap: Record<string, string>;
    /**
     * Source table id to the destination table an earlier paste already made
     * from it. These tables are not created again; the pasted host binds to the
     * existing one so the page renders the same Grid instead of an empty
     * create panel.
     */
    reusedTableIdMap: Record<string, string>;
    /**
     * Source table id to a Grid id that already exists in the destination for a
     * reused Table. Empty when no Grid is present yet.
     */
    reusedGridIdMap: Record<string, string>;
    /** Source table id to a safe, user-presentable failure reason. */
    failures: Record<string, string>;
    failedSourceTableIds: string[];
    skippedSourceTableIds?: string[];
    outcomes: TableCloneOutcome[];
}

export type TableCloneOutcome =
    | { type: "view-omission"; gridId: string; reason: string; }
    | {
        type: "cloned";
        sourceTableId: string;
        destinationTableId: string;
        tableName: string;
        sqlName: string;
        selected: boolean;
        rowCount?: number;
    }
    | { type: "dependency-added"; sourceTableId: string; tableName: string; }
    | { type: "renamed"; sourceTableId: string; tableName: string; from: string; to: string; }
    | { type: "rebound"; sourceTableId: string; tableName: string; relation: string; }
    | { type: "failed-group"; sourceTableIds: string[]; tableNames: string[]; reason: string; }
    | { type: "reused"; sourceTableId: string; destinationTableId: string; tableName: string; };

interface PlannedTable {
    snapshot: GridTableSnapshot;
    destinationSqlName: string;
    schemaSql: string;
    querySql: string;
    dependencyIds: Set<string>;
    reservedRelations: Set<string>;
    error?: string;
}

// Grid-level keys are no longer validated here: a Grid entry is built by
// `createGrid`, which is the only writer of its shape. Per-column component
// settings still travel as free-form maps, so those keys stay checked.
const COMPONENT_KEYS = new Set(["type", "label", "hidden", "widthPx"]);
let scratchCounter = 0;

function cloneErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function assertOnlyKeys(actual: Iterable<string>, expected: ReadonlySet<string>, context: string): void {
    for (const key of actual) {
        if (!expected.has(key)) throw new TableCloneError(`${context} contains unsupported key "${key}"`);
    }
}

export function exportGridSlice(projectDoc: Y.Doc, gridId: string): GridSnapshot {
    const handles = getGridHandles(projectDoc, gridId);
    if (!handles) throw new TableCloneError(`Grid "${gridId}" no longer exists`);
    const query = String(handles.entry.get("query") ?? "");
    // Null-prototype so an exact result-column name such as "__proto__" is
    // an ordinary own key rather than a prototype assignment.
    const components: Record<string, GridUiComponentDto> = Object.create(null);
    handles.components.forEach((cfg, column) => {
        if (!(cfg instanceof Y.Map)) return;
        assertOnlyKeys(cfg.keys(), COMPONENT_KEYS, `Grid UI component "${column}"`);
        const type = cfg.get("type");
        const label = cfg.get("label");
        const hidden = cfg.get("hidden");
        const widthPx = cfg.get("widthPx");
        const dto: GridUiComponentDto = {};
        if (type !== undefined) dto.type = type as GridUiComponentDto["type"];
        if (label !== undefined) dto.label = label as string;
        if (hidden !== undefined) dto.hidden = hidden as boolean;
        // A valid saved width travels with the definition; a malformed
        // stored width reads as automatic sizing and never fails the copy.
        if (isValidGridColumnWidth(widthPx)) dto.widthPx = widthPx;
        components[column] = dto;
    });
    const columnOrderValue = handles.entry.get("columnOrder");
    const columnOrder = Array.isArray(columnOrderValue)
        ? (columnOrderValue as string[])
        : columnOrderValue instanceof Y.Array
        ? (columnOrderValue.toArray() as string[])
        : [];
    const showAddRowButton = getGridShowAddRowButton(handles);
    const evidence = queryReadDependencies(projectDoc, query);
    if (evidence.status !== "complete") {
        throw new TableCloneError(`Grid "${gridId}": unknown read dependencies: ${evidence.diagnostics.join("; ")}`);
    }
    return {
        gridId,
        name: String(handles.entry.get("name") ?? "Grid"),
        query,
        components,
        columnOrder,
        showAddRowButton,
        confirmRowDelete: getGridConfirmRowDelete(handles),
        insertTargetTableId: getGridInsertTargetTableId(handles),
        tableIds: evidence.tableIds,
    };
}

/** Export Table schema and catalog evidence independently of view definitions. */
export function exportTableStructure(
    projectDoc: Y.Doc,
    tableId: string,
): GridTableSnapshot {
    const handles = getTableHandles(projectDoc, tableId);
    const name = getTableName(projectDoc, tableId);
    const sqlName = getTableSqlName(projectDoc, tableId);
    if (!handles || name === undefined || sqlName === undefined) {
        throw new TableCloneError(`Table "${tableId}" is not registered in this project`);
    }
    const snapshot: GridTableSnapshot = {
        sourceTableId: tableId,
        name,
        sqlName,
        schemaSql: handles.schemaText.toString(),
    };
    const catalog = readSqlCatalog(projectDoc.guid, projectDoc);
    if (catalog.status !== "ready") throw new TableCloneError("SQL catalog dependency evidence is unavailable");
    snapshot.catalog = catalog.snapshot;
    if (!isGridTableSnapshot(snapshot, tableId)) {
        throw new TableCloneError(`Table "${tableId}" does not have a portable structure`);
    }
    return snapshot;
}

/** Export the explicit Table identity set once each, preserving first-seen order. */
export function exportTableStructures(
    projectDoc: Y.Doc,
    tableIds: Iterable<string>,
): Record<string, GridTableSnapshot> {
    const snapshots: Record<string, GridTableSnapshot> = {};
    for (const tableId of tableIds) {
        if (snapshots[tableId] === undefined) {
            snapshots[tableId] = exportTableStructure(projectDoc, tableId);
        }
    }
    return snapshots;
}

/**
 * Resolves the full dependency closure of the given Table IDs by scanning
 * every Grid over each Table for the relations its query references. The
 * closure is expressed in Table ids so downstream export can pin the Table
 * subdocs; Grids themselves travel implicitly as one slice per Table.
 */
export function computeTableClosure(projectDoc: Y.Doc, initialTableIds: Iterable<string>): Set<string> {
    // Tables own only schema/data. View read dependencies are selected by
    // Grid identity before exporting their independent definitions.
    return new Set(initialTableIds);
}

/** Resolve a dependency closure using only portable clipboard snapshots. */
export function computeSnapshotClosure(
    snapshots: Readonly<Record<string, GridTableSnapshot>>,
    initialTableIds: Iterable<string>,
): Set<string> {
    const selected = new Set(initialTableIds);
    for (const id of selected) if (!snapshots[id]) throw new TableCloneError(`Dependency Table "${id}" is unavailable`);
    return selected;
}

function materializeSchema(handles: { schemaText: Y.Text; }, snapshot: GridTableSnapshot): void {
    handles.schemaText.insert(0, snapshot.schemaSql);
}

async function validatePlansInPglite(plans: PlannedTable[], catalogSources: readonly string[]): Promise<void> {
    const scratchSchema = `__yjstable_clone_${++scratchCounter}__`;
    await enqueueWrite(async (db) => {
        try {
            await db.exec(`DROP SCHEMA IF EXISTS "${scratchSchema}" CASCADE; CREATE SCHEMA "${scratchSchema}";`);
            try {
                await db.exec(`BEGIN; SET LOCAL search_path TO "${scratchSchema}";`);
                await db.exec(`${ITEMS_RELATION_CREATE_SQL};`);
                for (const source of catalogSources) await db.exec(`${source};`);
                for (const plan of plans) await db.exec(`${plan.schemaSql};`);
                for (const plan of plans) {
                    const query = plan.querySql.trim();
                    if (!query) continue;
                    const select = assertSelectQuery(query).replace(/;\s*$/, "");
                    await (db as PGlite).query(`EXPLAIN ${select}`);
                }
                await db.exec("COMMIT;");
            } catch (err) {
                try {
                    await db.exec("ROLLBACK;");
                } catch {
                    // no transaction to roll back
                }
                throw err;
            }
        } finally {
            try {
                await db.exec(`DROP SCHEMA IF EXISTS "${scratchSchema}" CASCADE;`);
            } catch {
                // scratch cleanup is best-effort
            }
        }
    });
}

function connectedGroups(plans: Map<string, PlannedTable>): string[][] {
    const adjacent = new Map<string, Set<string>>();
    for (const sourceTableId of plans.keys()) adjacent.set(sourceTableId, new Set());
    for (const [sourceTableId, plan] of plans) {
        for (const dependencyId of plan.dependencyIds) {
            if (!plans.has(dependencyId)) continue;
            adjacent.get(sourceTableId)!.add(dependencyId);
            adjacent.get(dependencyId)!.add(sourceTableId);
        }
    }

    const groups: string[][] = [];
    const visited = new Set<string>();
    for (const sourceTableId of [...plans.keys()].sort()) {
        if (visited.has(sourceTableId)) continue;
        const group: string[] = [];
        const queue = [sourceTableId];
        visited.add(sourceTableId);
        while (queue.length > 0) {
            const current = queue.shift()!;
            group.push(current);
            for (const next of adjacent.get(current)!) {
                if (!visited.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            }
        }
        groups.push(group.sort());
    }
    return groups;
}

/**
 * Clone portable snapshots into a destination project. Every dependency group
 * is fully rewritten and PGlite-validated before any member becomes visible in
 * the registry. A failed group is skipped while independent groups may succeed.
 */
export async function importTableStructures(
    destinationProjectDoc: Y.Doc,
    snapshots: Readonly<Record<string, GridTableSnapshot>>,
    sourceProjectId?: string,
    requestedSourceTableIds?: ReadonlySet<string>,
    allowProvenanceReuse = true,
    grids: Readonly<Record<string, GridSnapshot>> = {},
    catalog?: import("$shared/services/sqlCatalog").SqlCatalogSnapshot,
    admit: () => void = () => {},
): Promise<TableCloneResult> {
    admit();
    if (!isGridSnapshotMap(grids)) throw new TableCloneError("Grid definitions are malformed");
    let enumAdmission: StructuralEnumAdmission;
    let portableGuard: () => Promise<StructuralEnumAdmission>;
    const capturedCatalogs = Object.values(snapshots).map(snapshot => snapshot.catalog).filter(catalog =>
        catalog !== undefined
    );
    if (catalog) capturedCatalogs.push(catalog);
    if (capturedCatalogs.length > 0) {
        const catalog = capturedCatalogs[0];
        if (capturedCatalogs.some(candidate => candidate.revision !== catalog.revision)) {
            throw new TableCloneError("Clipboard SQL catalog evidence is inconsistent");
        }
        const portableSnapshot = {
            catalog,
            tables: Object.values(snapshots).map(snapshot => ({
                id: snapshot.sourceTableId,
                schema: snapshot.schemaSql,
                records: sourceProjectId === destinationProjectDoc.guid
                    ? [...(getTableHandles(destinationProjectDoc, snapshot.sourceTableId)?.data ?? [])].map(
                        ([id, values]) => ({ id, values: Object.fromEntries(values) }),
                    )
                    : [],
            })),
            inspections: Object.values(grids).filter(snapshot => snapshot.query.trim()).map(snapshot => ({
                id: snapshot.gridId,
                kind: "grid" as const,
                sql: snapshot.query,
            })),
        };
        const relevantIds = new Set([
            ...Object.keys(snapshots),
            ...Object.values(grids).filter(snapshot => snapshot.query.trim()).map(snapshot => snapshot.gridId),
        ]);
        portableGuard = () =>
            assertPortableStructuralEnumCompatibility(destinationProjectDoc, portableSnapshot, relevantIds);
        enumAdmission = await portableGuard();
    } else {
        throw new TableCloneError("Clipboard SQL catalog dependency evidence is unavailable");
    }
    const failures: Record<string, string> = {};
    const failureGroups: string[][] = [];
    const skippedSourceTableIds: string[] = [];
    const basic = new Map<string, GridTableSnapshot>();
    for (const [sourceTableId, snapshot] of Object.entries(snapshots)) {
        if (!isGridTableSnapshot(snapshot, sourceTableId)) {
            failures[sourceTableId] = "Grid table snapshot is malformed";
            failureGroups.push([sourceTableId]);
            continue;
        }
        basic.set(sourceTableId, snapshot);
    }

    const existingTables = listTables(destinationProjectDoc);
    const existingTableMap = new Map<string, string>(); // key: sourceProjectId:sourceTableId, value: tableId
    for (const table of existingTables) {
        if (table.sourceProjectId && table.sourceTableId) {
            existingTableMap.set(`${table.sourceProjectId}:${table.sourceTableId}`, table.tableId);
        }
    }

    const evidence = new TransferBindings(destinationProjectDoc);
    const bindings = new Map<string, { id: string; owned: boolean; }>();
    const captureBinding = (sourceId: string, id: string, owned: boolean) => {
        bindings.set(sourceId, { id, owned });
        evidence.capture("table", id, owned);
    };
    const cleanup = () => evidence.cleanupOwned(id => removeTable(destinationProjectDoc, id));
    const validateBindings = () => evidence.assertCurrent();
    const reusedTableIdMap: Record<string, string> = {};
    if (sourceProjectId && allowProvenanceReuse) {
        for (const [sourceTableId, _snapshot] of [...basic.entries()]) {
            const key = `${sourceProjectId}:${sourceTableId}`;
            const existingTableId = existingTableMap.get(key);
            if (existingTableId !== undefined) {
                // An earlier paste already made this table here. Creating a
                // second one would silently fork the data, so the paste binds
                // to the existing table instead; Paste Special's independent
                // copy is how a user asks for a real duplicate.
                basic.delete(sourceTableId);
                skippedSourceTableIds.push(sourceTableId);
                reusedTableIdMap[sourceTableId] = existingTableId;
                captureBinding(sourceTableId, existingTableId, false);
            }
        }
    }

    const idsBySqlName = new Map<string, string[]>();
    for (const [sourceTableId, snapshot] of basic) {
        const ids = idsBySqlName.get(snapshot.sqlName) ?? [];
        ids.push(sourceTableId);
        idsBySqlName.set(snapshot.sqlName, ids);
    }
    for (const [sqlName, sourceTableIds] of idsBySqlName) {
        if (sourceTableIds.length < 2) continue;
        failureGroups.push([...sourceTableIds].sort());
        for (const sourceTableId of sourceTableIds) {
            failures[sourceTableId] = `Several copied tables claim SQL relation "${sqlName}"`;
            basic.delete(sourceTableId);
        }
    }

    const taken = new Set(listTables(destinationProjectDoc).map(table => table.sqlName));
    const destinationNames = new Map<string, string>();
    for (const sourceTableId of [...basic.keys()].sort()) {
        const snapshot = basic.get(sourceTableId)!;
        const destinationSqlName = taken.has(snapshot.sqlName)
            ? deriveSqlName(snapshot.sqlName, taken)
            : snapshot.sqlName;
        taken.add(destinationSqlName);
        destinationNames.set(snapshot.sqlName, destinationSqlName);
    }

    const plans = new Map<string, PlannedTable>();
    for (const [sourceTableId, snapshot] of basic) {
        const destinationSqlName = destinationNames.get(snapshot.sqlName)!;
        const plan: PlannedTable = {
            snapshot: { ...snapshot },
            destinationSqlName,
            schemaSql: "",
            querySql: "",
            dependencyIds: new Set(),
            reservedRelations: new Set(),
        };
        plans.set(sourceTableId, plan);
        try {
            plan.schemaSql = rewriteCreateTableSql(
                snapshot.schemaSql,
                snapshot.sqlName,
                destinationSqlName,
            ).sql;
            plan.snapshot.schemaSql = plan.schemaSql;
        } catch (err) {
            plan.error = cloneErrorMessage(err);
        }
    }

    for (const grid of Object.values(grids)) {
        for (const id of grid.tableIds) {
            const plan = plans.get(id);
            if (plan) {
                for (const dependencyId of grid.tableIds) {
                    if (plans.has(dependencyId)) plan.dependencyIds.add(dependencyId);
                }
            }
        }
    }
    const tableIdMap: Record<string, string> = {};
    const gridIdMap: Record<string, string> = {};
    const assertAdmission = () => {
        try {
            admit();
            validateBindings();
        } catch (error) {
            cleanup();
            throw error;
        }
    };
    try {
        for (const group of connectedGroups(plans)) {
            const groupPlans = group.map(sourceTableId => plans.get(sourceTableId)!);
            const planningFailure = groupPlans.find(plan => plan.error)?.error;
            if (planningFailure) {
                for (const sourceTableId of group) failures[sourceTableId] = planningFailure;
                failureGroups.push(group);
                continue;
            }

            try {
                const requiredIds = new Set(enumAdmission.requiredEnums.map(item => item.objectId));
                const catalogSources = enumAdmission.sourceDescriptor.catalogObjects
                    .filter(object => requiredIds.has(object.id)).map(object => object.source);
                await validatePlansInPglite(groupPlans, catalogSources);
            } catch (err) {
                const message = `Grid table structure failed SQL validation: ${cloneErrorMessage(err)}`;
                for (const sourceTableId of group) failures[sourceTableId] = message;
                failureGroups.push(group);
                continue;
            }

            enumAdmission = await portableGuard();
            assertAdmission();
            const currentSqlNames = new Set(listTables(destinationProjectDoc).map(table => table.sqlName));
            const occupiedName = groupPlans.find(plan => currentSqlNames.has(plan.destinationSqlName))
                ?.destinationSqlName;
            if (occupiedName !== undefined) {
                const message = `Destination SQL relation "${occupiedName}" became occupied before Grid table creation`;
                for (const sourceTableId of group) failures[sourceTableId] = message;
                failureGroups.push(group);
                continue;
            }

            try {
                // Compiler/scratch planning is asynchronous. Re-admit against the
                // live destination immediately before the first registry/subdoc
                // effect so a catalog edit during planning cannot change meaning.
                for (const sourceTableId of group) {
                    const plan = plans.get(sourceTableId)!;
                    const destinationTableId = createTable(
                        destinationProjectDoc,
                        plan.snapshot.name,
                        plan.destinationSqlName,
                        sourceProjectId ? { sourceProjectId, sourceTableId } : undefined,
                        handles => materializeSchema(handles, plan.snapshot),
                    );
                    tableIdMap[sourceTableId] = destinationTableId;
                    captureBinding(sourceTableId, destinationTableId, true);
                }
            } catch (err) {
                for (const sourceTableId of group) {
                    const binding = bindings.get(sourceTableId);
                    if (binding?.owned) {
                        evidence.discardAllocation("table", binding.id, id => removeTable(destinationProjectDoc, id));
                    }
                    bindings.delete(sourceTableId);
                    delete tableIdMap[sourceTableId];
                    failures[sourceTableId] = `Grid table creation failed: ${cloneErrorMessage(err)}`;
                }
                failureGroups.push(group);
            }
        }

        const failedSourceTableIds = Object.keys(failures).sort();
        const outcomes: TableCloneOutcome[] = [];
        for (const [sourceTableId, destinationTableId] of Object.entries(tableIdMap)) {
            const snapshot = snapshots[sourceTableId];
            const destinationSqlName = plans.get(sourceTableId)?.destinationSqlName ?? snapshot.sqlName;
            outcomes.push({
                type: "cloned",
                sourceTableId,
                destinationTableId,
                tableName: snapshot.name,
                sqlName: destinationSqlName,
                selected: requestedSourceTableIds?.has(sourceTableId) ?? true,
            });
            if (requestedSourceTableIds && !requestedSourceTableIds.has(sourceTableId)) {
                outcomes.push({ type: "dependency-added", sourceTableId, tableName: snapshot.name });
            }
            if (destinationSqlName !== snapshot.sqlName) {
                outcomes.push({
                    type: "renamed",
                    sourceTableId,
                    tableName: snapshot.name,
                    from: snapshot.sqlName,
                    to: destinationSqlName,
                });
            }
            for (const relation of plans.get(sourceTableId)?.reservedRelations ?? []) {
                outcomes.push({ type: "rebound", sourceTableId, tableName: snapshot.name, relation });
            }
        }
        const reusedGridIdMap: Record<string, string> = {};
        for (const sourceTableId of skippedSourceTableIds) {
            const snapshot = snapshots[sourceTableId];
            const destinationTableId = reusedTableIdMap[sourceTableId];
            if (snapshot && destinationTableId !== undefined) {
                outcomes.push({ type: "reused", sourceTableId, destinationTableId, tableName: snapshot.name });
            }
        }
        for (const sourceTableIds of failureGroups) {
            const reason = failures[sourceTableIds[0]];
            outcomes.push({
                type: "failed-group",
                sourceTableIds,
                tableNames: sourceTableIds.map(sourceTableId => snapshots[sourceTableId]?.name ?? sourceTableId),
                reason,
            });
        }
        assertAdmission();
        const sameProject = sourceProjectId === destinationProjectDoc.guid;
        const allTableIds = Object.fromEntries([...bindings].map(([sourceId, binding]) => [sourceId, binding.id]));
        const nameMap = new Map<string, string>();
        for (const [id, target] of Object.entries(allTableIds)) {
            const sourceName = snapshots[id]?.sqlName;
            const destinationName = getTableSqlName(destinationProjectDoc, target);
            if (sourceName && destinationName) nameMap.set(sourceName, destinationName);
        }
        const gridRegistry = getGridRegistry(destinationProjectDoc);
        try {
            for (const [sourceGridId, grid] of Object.entries(grids)) {
                if (grid.tableIds.some(id => failures[id])) continue;
                let reused: string | undefined;
                if (allowProvenanceReuse && sourceProjectId) {
                    gridRegistry.forEach((entry, id) => {
                        if (
                            entry.get("copiedFromProjectId") === sourceProjectId
                            && entry.get("copiedFromGridId") === sourceGridId
                        ) reused ??= id;
                    });
                }
                if (reused) {
                    reusedGridIdMap[sourceGridId] = reused;
                    evidence.capture("grid", reused, false);
                    continue;
                }
                const omitted = grid.tableIds.filter(id => !allTableIds[id] && !sameProject);
                const preference = grid.insertTargetTableId;
                const mappedPreference = preference
                    ? allTableIds[preference] ?? (sameProject ? preference : undefined)
                    : undefined;
                const query = omitted.length ? "" : rewriteTableQuerySql(grid.query, nameMap).sql;
                if (omitted.length) {
                    outcomes.push({
                        type: "view-omission",
                        gridId: sourceGridId,
                        reason: `Query unavailable: omitted Tables ${omitted.join(", ")}`,
                    });
                }
                if (preference && !mappedPreference) {
                    outcomes.push({
                        type: "view-omission",
                        gridId: sourceGridId,
                        reason: `Cleared unmappable INSERT preference ${preference}`,
                    });
                }
                const id = createGrid(destinationProjectDoc, {
                    ...grid,
                    gridId: undefined,
                    query,
                    insertTargetTableId: mappedPreference,
                });
                gridIdMap[sourceGridId] = id;
                const entry = gridRegistry.get(id)!;
                if (sourceProjectId) {
                    entry.set("copiedFromProjectId", sourceProjectId);
                    entry.set("copiedFromGridId", sourceGridId);
                }
                evidence.capture("grid", id, true, entry);
            }
        } catch (error) {
            cleanup();
            throw error;
        }
        assertAdmission();
        return {
            enumAdmission,
            bindings: evidence,
            tableIdMap,
            gridIdMap,
            reusedTableIdMap,
            reusedGridIdMap,
            failures,
            failedSourceTableIds,
            skippedSourceTableIds,
            outcomes,
        };
    } catch (error) {
        cleanup();
        throw error;
    }
}
