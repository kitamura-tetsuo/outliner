import type { PGlite } from "@electric-sql/pglite";
import * as Y from "yjs";
import { type GridTableSnapshot, type GridUiComponentDto, isGridTableSnapshot } from "../clipboard/itemClipboard";
import { ITEMS_RELATION_CREATE_SQL } from "./itemsRelation";
import { enqueueWrite } from "./pgliteService";
import { assertSelectQuery } from "./queryAnalysis";
import { deriveSqlName } from "./sqlNames";
import {
    createTable,
    getTableHandles,
    getTableName,
    getTableSqlName,
    listTables,
    removeTable,
    type TableHandles,
    type TableInitializationHandles,
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
    /** Source table id to fresh destination table id for successful clones. */
    tableIdMap: Record<string, string>;
    /** Source table id to a safe, user-presentable failure reason. */
    failures: Record<string, string>;
    failedSourceTableIds: string[];
    skippedSourceTableIds?: string[];
    outcomes: TableCloneOutcome[];
}

export type TableCloneOutcome =
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
    | { type: "reuse-offered"; sourceTableId: string; tableName: string; };

interface PlannedTable {
    snapshot: GridTableSnapshot;
    destinationSqlName: string;
    schemaSql: string;
    querySql: string;
    dependencyIds: Set<string>;
    reservedRelations: Set<string>;
    error?: string;
}

const UI_KEYS = new Set(["query", "components", "columnOrder"]);
const COMPONENT_KEYS = new Set(["type", "label", "hidden"]);
let scratchCounter = 0;

function cloneErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function assertOnlyKeys(actual: Iterable<string>, expected: ReadonlySet<string>, context: string): void {
    for (const key of actual) {
        if (!expected.has(key)) throw new TableCloneError(`${context} contains unsupported key "${key}"`);
    }
}

function exportUiDefinition(uiDef: Y.Map<unknown>): GridTableSnapshot["ui"] {
    assertOnlyKeys(uiDef.keys(), UI_KEYS, "Grid UI Definition");
    const query = uiDef.get("query");
    if (query !== undefined && typeof query !== "string") {
        throw new TableCloneError("Grid UI query must be a string");
    }

    const componentsValue = uiDef.get("components");
    if (componentsValue !== undefined && !(componentsValue instanceof Y.Map)) {
        throw new TableCloneError("Grid UI components must be a Y.Map");
    }
    const components: Record<string, GridUiComponentDto> = {};
    (componentsValue as Y.Map<unknown> | undefined)?.forEach((config, column) => {
        if (!(config instanceof Y.Map)) {
            throw new TableCloneError(`Grid UI component "${column}" must be a Y.Map`);
        }
        assertOnlyKeys(config.keys(), COMPONENT_KEYS, `Grid UI component "${column}"`);
        const type = config.get("type");
        const label = config.get("label");
        const hidden = config.get("hidden");
        const dto: GridUiComponentDto = {};
        if (type !== undefined) dto.type = type as GridUiComponentDto["type"];
        if (label !== undefined) dto.label = label as string;
        if (hidden !== undefined) dto.hidden = hidden as boolean;
        components[column] = dto;
    });

    const columnOrderValue = uiDef.get("columnOrder");
    if (columnOrderValue !== undefined && !Array.isArray(columnOrderValue) && !(columnOrderValue instanceof Y.Array)) {
        throw new TableCloneError("Grid UI columnOrder must be an Array or Y.Array");
    }
    const ui = {
        query: query ?? "",
        components,
        columnOrder: Array.isArray(columnOrderValue)
            ? columnOrderValue
            : (columnOrderValue instanceof Y.Array ? columnOrderValue.toArray() : []),
    };
    const candidate = {
        sourceTableId: "validation",
        name: "",
        sqlName: "validation",
        schemaSql: "CREATE TABLE validation (id TEXT)",
        ui,
    };
    if (!isGridTableSnapshot(candidate)) throw new TableCloneError("Grid UI Definition is malformed");
    return ui;
}

/** Export only display metadata, Schema Definition, and the explicit Grid UI DTO. */
export function exportTableStructure(projectDoc: Y.Doc, tableId: string): GridTableSnapshot {
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
        ui: exportUiDefinition(handles.uiDef),
    };
    if (!isGridTableSnapshot(snapshot, tableId)) {
        throw new TableCloneError(`Table "${tableId}" does not have a portable structure`);
    }
    return snapshot;
}

/** Export several table structures once each, preserving first-seen order. */
export function exportTableStructures(
    projectDoc: Y.Doc,
    tableIds: Iterable<string>,
): Record<string, GridTableSnapshot> {
    const snapshots: Record<string, GridTableSnapshot> = {};
    for (const tableId of tableIds) {
        if (snapshots[tableId] === undefined) snapshots[tableId] = exportTableStructure(projectDoc, tableId);
    }
    return snapshots;
}

/** Resolves the full dependency closure of the given table IDs by parsing their queries. */
export function computeTableClosure(projectDoc: Y.Doc, initialTableIds: Iterable<string>): Set<string> {
    const visited = new Set<string>(initialTableIds);
    const queue = Array.from(visited);
    const registry = listTables(projectDoc);
    const sqlNameToTableId = new Map(registry.map(entry => [entry.sqlName, entry.tableId]));

    while (queue.length > 0) {
        const tableId = queue.shift()!;
        const handles = getTableHandles(projectDoc, tableId);
        if (!handles) continue;

        const query = String(handles.uiDef.get("query") ?? "");
        if (!query) continue;

        let queryRewrite;
        try {
            queryRewrite = rewriteTableQuerySql(query, new Map());
        } catch {
            continue; // Ignore tables with invalid queries
        }

        for (const dependency of queryRewrite.relationDependencies) {
            const depTableId = sqlNameToTableId.get(dependency);
            if (depTableId && !visited.has(depTableId)) {
                visited.add(depTableId);
                queue.push(depTableId);
            }
        }
    }
    return visited;
}

/** Resolve a dependency closure using only portable clipboard snapshots. */
export function computeSnapshotClosure(
    snapshots: Readonly<Record<string, GridTableSnapshot>>,
    initialTableIds: Iterable<string>,
): Set<string> {
    const visited = new Set<string>(initialTableIds);
    const queue = Array.from(visited);
    const sqlNameToTableId = new Map(
        Object.entries(snapshots).map(([tableId, snapshot]) => [snapshot.sqlName, tableId]),
    );

    while (queue.length > 0) {
        const tableId = queue.shift()!;
        const snapshot = snapshots[tableId];
        if (!snapshot) continue;
        try {
            const rewrite = rewriteTableQuerySql(snapshot.ui.query, new Map());
            for (const dependency of rewrite.relationDependencies) {
                const dependencyId = sqlNameToTableId.get(dependency);
                if (dependencyId && !visited.has(dependencyId)) {
                    visited.add(dependencyId);
                    queue.push(dependencyId);
                }
            }
        } catch {
            // Import validation reports malformed queries; closure collection
            // still keeps the selected host so its failure reaches the user.
        }
    }
    return visited;
}

function materializeUi(handles: TableInitializationHandles, snapshot: GridTableSnapshot, querySql: string): void {
    handles.schemaText.insert(0, snapshot.schemaSql);
    handles.uiDef.set("query", querySql);

    const components = new Y.Map<Y.Map<unknown>>();
    for (const [column, config] of Object.entries(snapshot.ui.components)) {
        const component = new Y.Map<unknown>();
        if (config.type !== undefined) component.set("type", config.type);
        if (config.label !== undefined) component.set("label", config.label);
        if (config.hidden !== undefined) component.set("hidden", config.hidden);
        components.set(column, component);
    }
    handles.uiDef.set("components", components);

    handles.uiDef.set("columnOrder", snapshot.ui.columnOrder.length > 0 ? [...snapshot.ui.columnOrder] : []);
}

async function validatePlansInPglite(plans: PlannedTable[]): Promise<void> {
    const scratchSchema = `__yjstable_clone_${++scratchCounter}__`;
    await enqueueWrite(async (db) => {
        try {
            await db.exec(`DROP SCHEMA IF EXISTS "${scratchSchema}" CASCADE; CREATE SCHEMA "${scratchSchema}";`);
            try {
                await db.exec(`BEGIN; SET LOCAL search_path TO "${scratchSchema}";`);
                await db.exec(`${ITEMS_RELATION_CREATE_SQL};`);
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
): Promise<TableCloneResult> {
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

    if (sourceProjectId) {
        for (const [sourceTableId, _snapshot] of [...basic.entries()]) {
            const key = `${sourceProjectId}:${sourceTableId}`;
            if (existingTableMap.has(key)) {
                // Table already exists with matching provenance.
                // We skip cloning it to let the block component fall back to its "Existing Table" UI.
                basic.delete(sourceTableId);
                skippedSourceTableIds.push(sourceTableId);
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

    const sourceIdBySqlName = new Map(
        [...basic.entries()].map(([sourceTableId, snapshot]) => [snapshot.sqlName, sourceTableId]),
    );
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
            const queryRewrite = rewriteTableQuerySql(snapshot.ui.query, destinationNames);
            plan.querySql = queryRewrite.sql;
            plan.reservedRelations = new Set(queryRewrite.reservedRelationDependencies);
            for (const dependency of queryRewrite.relationDependencies) {
                const dependencyId = sourceIdBySqlName.get(dependency);
                if (!dependencyId) {
                    plan.error = `Query depends on source relation "${dependency}" that is absent from the clipboard`;
                } else plan.dependencyIds.add(dependencyId);
            }
        } catch (err) {
            plan.error = cloneErrorMessage(err);
        }
    }

    const tableIdMap: Record<string, string> = {};
    for (const group of connectedGroups(plans)) {
        const groupPlans = group.map(sourceTableId => plans.get(sourceTableId)!);
        const planningFailure = groupPlans.find(plan => plan.error)?.error;
        if (planningFailure) {
            for (const sourceTableId of group) failures[sourceTableId] = planningFailure;
            failureGroups.push(group);
            continue;
        }

        try {
            await validatePlansInPglite(groupPlans);
        } catch (err) {
            const message = `Grid table structure failed SQL validation: ${cloneErrorMessage(err)}`;
            for (const sourceTableId of group) failures[sourceTableId] = message;
            failureGroups.push(group);
            continue;
        }

        const currentSqlNames = new Set(listTables(destinationProjectDoc).map(table => table.sqlName));
        const occupiedName = groupPlans.find(plan => currentSqlNames.has(plan.destinationSqlName))?.destinationSqlName;
        if (occupiedName !== undefined) {
            const message = `Destination SQL relation "${occupiedName}" became occupied before Grid table creation`;
            for (const sourceTableId of group) failures[sourceTableId] = message;
            failureGroups.push(group);
            continue;
        }

        const created: string[] = [];
        try {
            for (const sourceTableId of group) {
                const plan = plans.get(sourceTableId)!;
                const destinationTableId = createTable(
                    destinationProjectDoc,
                    plan.snapshot.name,
                    plan.destinationSqlName,
                    sourceProjectId ? { sourceProjectId, sourceTableId } : undefined,
                    handles => materializeUi(handles, plan.snapshot, plan.querySql),
                );
                created.push(destinationTableId);
                tableIdMap[sourceTableId] = destinationTableId;
            }
        } catch (err) {
            for (const destinationTableId of created) removeTable(destinationProjectDoc, destinationTableId);
            for (const sourceTableId of group) {
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
    for (const sourceTableId of skippedSourceTableIds) {
        const snapshot = snapshots[sourceTableId];
        if (snapshot) outcomes.push({ type: "reuse-offered", sourceTableId, tableName: snapshot.name });
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
    return { tableIdMap, failures, failedSourceTableIds, skippedSourceTableIds, outcomes };
}
