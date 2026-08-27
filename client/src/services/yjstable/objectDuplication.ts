import { Project } from "$shared/app-schema";
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { createScheduleRule } from "../schedule/scheduleRuleService";
import { createGrid, getGridColumnOrder, getGridHandles, getGridRegistry, listGrids } from "./gridDocs";
import { deriveSqlName } from "./sqlNames";
import { createTable, getTableHandles, listTables, removeTable, type TableRecordValue } from "./tableDocs";
import type { TableDocConnection } from "./tableEngine";
import { rewriteCreateTableSql, rewriteTableQuerySql } from "./tableSqlRewrite";

export type DuplicableObject = { type: "grid" | "table" | "schedule"; id: string; };
export type DuplicationScope = "item-only" | "referenced" | "referencing" | "connected";

function schedulesMapOf(doc: Y.Doc): Y.Map<Y.Map<ScheduleRuleValueType>> {
    return doc.getMap("schedules") as Y.Map<Y.Map<ScheduleRuleValueType>>;
}

export interface DuplicationPreview {
    objects: DuplicableObject[];
    omittedReferenceCount: number;
}

export interface DuplicationResult {
    idMap: ReadonlyMap<string, string>;
    primaryId: string;
    removedReferenceCount: number;
}

function key(object: DuplicableObject): string {
    return `${object.type}:${object.id}`;
}

function allocateCopyName(name: string, taken: Set<string>): string {
    let candidate = `${name || "Untitled"} copy`;
    let suffix = 2;
    while (taken.has(candidate)) candidate = `${name || "Untitled"} copy ${suffix++}`;
    taken.add(candidate);
    return candidate;
}

/**
 * Collect the complete object graph before mutation. The visited set makes
 * shared Tables and cycles safe and guarantees that every source object is
 * represented at most once in the resulting duplication plan.
 */
export function previewObjectDuplication(
    source: Y.Doc,
    primary: DuplicableObject,
    scope: DuplicationScope,
): DuplicationPreview {
    const grids = listGrids(source);
    const tableEntries = listTables(source);
    const tables = new Set(tableEntries.map(table => table.tableId));
    const tableBySqlName = new Map(tableEntries.map(table => [table.sqlName, table.tableId]));
    const referencesByGrid = new Map<string, Set<string>>();
    const byTable = new Map<string, string[]>();
    for (const grid of grids) {
        const references = new Set<string>();
        if (grid.sourceTableId) references.add(grid.sourceTableId);
        const handles = getGridHandles(source, grid.gridId);
        try {
            const query = String(handles?.entry.get("query") ?? "");
            for (const sqlName of rewriteTableQuerySql(query, new Map()).relationDependencies) {
                const tableId = tableBySqlName.get(sqlName);
                if (tableId) references.add(tableId);
            }
        } catch {
            // An invalid query remains copyable; its explicit source reference
            // is still included and the editor can report the SQL error.
        }
        referencesByGrid.set(grid.gridId, references);
        for (const tableId of references) {
            const ids = byTable.get(tableId) ?? [];
            ids.push(grid.gridId);
            byTable.set(tableId, ids);
        }
    }

    // A Schedule references Tables the same way a Grid does — as an explicit
    // write target plus whatever its statement reads — so it is discovered
    // and traversed by the same recursive rules (issue #5102). Relation names
    // come from `rewriteTableQuerySql`'s FROM/JOIN/DML-target scan, not from
    // matching every bare identifier in the SQL: a column or alias that
    // happens to share a Table's SQL name (e.g. a `status` column read from a
    // Table also named `status`) must never be mistaken for a dependency.
    const referencesBySchedule = new Map<string, Set<string>>();
    const scheduleByTable = new Map<string, string[]>();
    schedulesMapOf(source).forEach((rule, ruleId) => {
        const references = new Set<string>();
        const targetTableId = rule.get("targetTableId");
        if (typeof targetTableId === "string" && targetTableId && tables.has(targetTableId)) {
            references.add(targetTableId);
        }
        const sql = rule.get("sql");
        try {
            for (const sqlName of rewriteTableQuerySql(String(sql ?? ""), new Map()).relationDependencies) {
                const tableId = tableBySqlName.get(sqlName);
                if (tableId) references.add(tableId);
            }
        } catch {
            // An invalid statement remains copyable; its explicit write-target
            // reference is still included and the editor can report the error.
        }
        referencesBySchedule.set(ruleId, references);
        for (const tableId of references) {
            const ids = scheduleByTable.get(tableId) ?? [];
            ids.push(ruleId);
            scheduleByTable.set(tableId, ids);
        }
    });

    const visited = new Map<string, DuplicableObject>();
    const queue = [primary];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(key(current))) continue;
        visited.set(key(current), current);

        if (scope === "referenced" || scope === "connected") {
            if (current.type === "grid") {
                for (const tableId of referencesByGrid.get(current.id) ?? []) {
                    if (tables.has(tableId)) queue.push({ type: "table", id: tableId });
                }
            }
            if (current.type === "schedule") {
                for (const tableId of referencesBySchedule.get(current.id) ?? []) {
                    if (tables.has(tableId)) queue.push({ type: "table", id: tableId });
                }
            }
        }
        if ((scope === "referencing" || scope === "connected") && current.type === "table") {
            for (const gridId of byTable.get(current.id) ?? []) queue.push({ type: "grid", id: gridId });
            for (const ruleId of scheduleByTable.get(current.id) ?? []) queue.push({ type: "schedule", id: ruleId });
        }
    }

    let omittedReferenceCount = 0;
    for (const object of visited.values()) {
        const references = object.type === "grid"
            ? referencesByGrid.get(object.id)
            : object.type === "schedule"
            ? referencesBySchedule.get(object.id)
            : undefined;
        for (const tableId of references ?? []) {
            if (!visited.has(key({ type: "table", id: tableId }))) omittedReferenceCount++;
        }
    }
    return { objects: [...visited.values()], omittedReferenceCount };
}

/**
 * Materialize a previously previewed graph. IDs are allocated up front and
 * references are rewritten only against that map. On failure all registry
 * entries made by this invocation are removed, so observers never retain a
 * partially copied graph.
 */
export async function duplicateObjects(
    source: Y.Doc,
    destination: Y.Doc,
    primary: DuplicableObject,
    scope: DuplicationScope,
    options: {
        copyTableData?: boolean;
        /** Synchronize remote Table subdocs before reading the completed plan. */
        synchronizeTableSubdocs?: boolean;
    } = {},
): Promise<DuplicationResult> {
    const preview = previewObjectDuplication(source, primary, scope);
    const tableObjects = preview.objects.filter(object => object.type === "table");
    const connections: TableDocConnection[] = [];

    // Discovery is deliberately complete before any connection or destination
    // mutation. A registry entry can expose its subdoc before that subdoc's
    // contents have arrived, so every Table in the completed graph must be
    // synchronized before schema rewriting or row copying starts.
    if (options.synchronizeTableSubdocs && tableObjects.length > 0) {
        const { connectTableDoc } = await import("../../lib/yjs/connection");
        try {
            for (const object of tableObjects) {
                const entry = listTables(source).find(table => table.tableId === object.id);
                const handles = getTableHandles(source, object.id);
                if (!entry || !handles) throw new Error(`Table "${object.id}" no longer exists`);
                try {
                    // The project document GUID is the room id. The route's
                    // `sourceProject` value is only its human-readable title
                    // and cannot authorize a Table room connection.
                    const connection = await connectTableDoc(source.guid, object.id, handles.doc);
                    connections.push(connection);
                    const { synced } = await connection.waitForInitialSync();
                    if (!synced) throw new Error("initial synchronization timed out");
                } catch (error) {
                    throw new Error(
                        `Table "${entry.name || entry.sqlName || object.id}" could not be synchronized.`,
                        { cause: error },
                    );
                }
            }
        } catch (error) {
            await Promise.allSettled(connections.map(connection => connection.dispose()));
            throw error;
        }
    }
    const idMap = new Map<string, string>();
    for (const object of preview.objects) idMap.set(key(object), uuidv4());

    const sameProject = source === destination;
    const createdTables: string[] = [];
    const createdGrids: string[] = [];
    const createdSchedules: string[] = [];
    const tableNames = new Set(listTables(destination).map(table => table.name));
    const gridNames = new Set(listGrids(destination).map(grid => grid.name));
    const sqlNames = new Set(listTables(destination).map(table => table.sqlName));
    const scheduleNames = new Set<string>();
    schedulesMapOf(destination).forEach(rule => {
        const name = rule.get("name");
        if (typeof name === "string" && name) scheduleNames.add(name);
    });
    const sqlNameMap = new Map<string, string>();
    const destinationProject = Project.fromDoc(destination);
    let removedReferenceCount = 0;

    try {
        // Tables precede Grids, but both kinds already have destination IDs.
        for (const object of preview.objects.filter(object => object.type === "table")) {
            const sourceEntry = listTables(source).find(table => table.tableId === object.id);
            const sourceHandles = getTableHandles(source, object.id);
            if (!sourceEntry || !sourceHandles) throw new Error(`Table "${object.id}" no longer exists`);
            const destinationId = idMap.get(key(object))!;
            const destinationSqlName = deriveSqlName(sourceEntry.sqlName, sqlNames);
            sqlNameMap.set(sourceEntry.sqlName, destinationSqlName);
            sqlNames.add(destinationSqlName);
            const schema = rewriteCreateTableSql(
                sourceHandles.schemaText.toString(),
                sourceEntry.sqlName,
                destinationSqlName,
            ).sql;
            createTable(destination, allocateCopyName(sourceEntry.name, tableNames), destinationSqlName, {
                tableId: destinationId,
            }, handles => {
                handles.schemaText.insert(0, schema);
                if (options.copyTableData) {
                    sourceHandles.data.forEach((record, recordId) => {
                        const copy = new Y.Map<TableRecordValue>();
                        record.forEach((value, column) => copy.set(column, value));
                        handles.data.set(recordId, copy);
                    });
                }
            });
            createdTables.push(destinationId);
        }

        for (const object of preview.objects.filter(object => object.type === "grid")) {
            const sourceGrid = listGrids(source).find(grid => grid.gridId === object.id);
            const handles = getGridHandles(source, object.id);
            if (!sourceGrid || !handles) throw new Error(`Grid "${object.id}" no longer exists`);
            const copiedTableId = idMap.get(key({ type: "table", id: sourceGrid.sourceTableId }));
            const targetTableId = copiedTableId ?? (sameProject ? sourceGrid.sourceTableId : "");
            if (!targetTableId && sourceGrid.sourceTableId) removedReferenceCount++;
            const components: Record<string, { type?: string; label?: string; hidden?: boolean; }> = {};
            handles.components.forEach((component, column) => {
                components[column] = {
                    type: component.get("type") as string | undefined,
                    label: component.get("label") as string | undefined,
                    hidden: component.get("hidden") as boolean | undefined,
                };
            });
            const destinationId = idMap.get(key(object))!;
            const sourceQuery = String(handles.entry.get("query") ?? "");
            const queryRewrite = rewriteTableQuerySql(sourceQuery, sqlNameMap);
            const omittedQueryReferences = queryRewrite.relationDependencies
                .filter(sqlName => !sqlNameMap.has(sqlName));
            const targetQuery = !sameProject && omittedQueryReferences.length > 0 ? "" : queryRewrite.sql;
            if (!sameProject) removedReferenceCount += omittedQueryReferences.length;
            createGrid(destination, targetTableId, {
                gridId: destinationId,
                name: allocateCopyName(sourceGrid.name, gridNames),
                query: targetQuery,
                columnOrder: getGridColumnOrder(handles),
                components,
            });
            createdGrids.push(destinationId);
        }

        // Schedules never own a Table, but a copied Schedule's definition
        // must point at the copied Table graph exactly like a Grid's does:
        // its write target through `idMap`, and any relation its SQL names
        // through `sqlNameMap` (issue #5102). Runtime/execution state is
        // deliberately not read here — the copy is a new, unrun instance.
        for (const object of preview.objects.filter(object => object.type === "schedule")) {
            const ruleMap = schedulesMapOf(source).get(object.id);
            if (!ruleMap) throw new Error(`Schedule "${object.id}" no longer exists`);

            const sourceTargetTableId = String(ruleMap.get("targetTableId") ?? "");
            const copiedTargetTableId = sourceTargetTableId
                ? idMap.get(key({ type: "table", id: sourceTargetTableId }))
                : undefined;
            const targetTableId = copiedTargetTableId ?? (sameProject ? sourceTargetTableId : "");
            if (!targetTableId && sourceTargetTableId) removedReferenceCount++;

            const sourceSql = String(ruleMap.get("sql") ?? "");
            const sqlRewrite = rewriteTableQuerySql(sourceSql, sqlNameMap);
            const omittedSqlReferences = sqlRewrite.relationDependencies
                .filter(sqlName => !sqlNameMap.has(sqlName));
            const targetSql = !sameProject && omittedSqlReferences.length > 0 ? "" : sqlRewrite.sql;
            if (!sameProject) removedReferenceCount += omittedSqlReferences.length;

            const sourceName = (ruleMap.get("name") as string | undefined) || "Untitled Schedule";
            const destinationId = idMap.get(key(object))!;
            const dtstart = ruleMap.get("dtstart");
            const timezone = ruleMap.get("timezone");
            createScheduleRule(destinationProject, {
                ruleId: destinationId,
                name: allocateCopyName(sourceName, scheduleNames),
                targetTableId,
                sql: targetSql,
                rrule: String(ruleMap.get("rrule") ?? ""),
                ...(typeof dtstart === "string" ? { dtstart } : {}),
                ...(typeof timezone === "string" ? { timezone } : {}),
                catchUp: ruleMap.get("catchUp") !== false,
                // Same-project copies keep running on the schedule the user
                // already configured; a copy that lands in another project
                // (a demo/template, most often) must never start writing on
                // a timer the user has not reviewed yet (issue #5102).
                enabled: sameProject ? ruleMap.get("enabled") !== false : false,
            });
            createdSchedules.push(destinationId);
        }
    } catch (error) {
        destination.transact(() => {
            for (const ruleId of createdSchedules) schedulesMapOf(destination).delete(ruleId);
            for (const gridId of createdGrids) getGridRegistry(destination).delete(gridId);
            for (const tableId of createdTables) removeTable(destination, tableId);
        });
        throw error;
    } finally {
        await Promise.allSettled(connections.map(connection => connection.dispose()));
    }

    return { idMap, primaryId: idMap.get(key(primary))!, removedReferenceCount };
}
