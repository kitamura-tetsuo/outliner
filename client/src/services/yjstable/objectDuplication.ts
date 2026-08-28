import { Project } from "$shared/app-schema";
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { createCalendar, getCalendar, listCalendars } from "../calendar/calendarService";
import {
    buildObjectDependencyGraph,
    type GraphObject,
    objectGraphKey,
    traverseObjectGraph,
} from "../objectManager/objectDependencyGraph";
import { createScheduleRule } from "../schedule/scheduleRuleService";
import {
    createGrid,
    getGridColumnOrder,
    getGridHandles,
    getGridRegistry,
    getGridShowAddRowButton,
    listGrids,
} from "./gridDocs";
import { deriveSqlName } from "./sqlNames";
import { createTable, getTableHandles, listTables, removeTable, type TableRecordValue } from "./tableDocs";
import type { TableDocConnection } from "./tableEngine";
import { rewriteCreateTableSql, rewriteTableQuerySql } from "./tableSqlRewrite";

export type DuplicableObject = GraphObject;
export type DuplicationScope = "item-only" | "referenced" | "referencing" | "connected";

function schedulesMapOf(doc: Y.Doc): Y.Map<Y.Map<ScheduleRuleValueType>> {
    return doc.getMap("schedules") as Y.Map<Y.Map<ScheduleRuleValueType>>;
}

const DIRECTION_BY_SCOPE: Record<Exclude<DuplicationScope, "item-only">, "dependencies" | "dependents" | "connected"> =
    {
        referenced: "dependencies",
        referencing: "dependents",
        connected: "connected",
    };

export interface DuplicationPreview {
    objects: DuplicableObject[];
    omittedReferenceCount: number;
}

export interface DuplicationResult {
    idMap: ReadonlyMap<string, string>;
    primaryId: string;
    removedReferenceCount: number;
    createdObjects: DuplicableObject[];
}

/** Remove every object materialized by one duplication attempt. */
export function rollbackObjectDuplication(destination: Y.Doc, result: DuplicationResult): void {
    const destinationProject = Project.fromDoc(destination);
    destination.transact(() => {
        for (const object of result.createdObjects.toReversed()) {
            if (object.type === "grid") getGridRegistry(destination).delete(object.id);
            else if (object.type === "table") removeTable(destination, object.id);
            else if (object.type === "calendar") destinationProject.calendars.delete(object.id);
            else schedulesMapOf(destination).delete(object.id);
        }
    });
}

const key = objectGraphKey;

function allocateCopyName(name: string, taken: Set<string>): string {
    let candidate = `${name || "Untitled"} copy`;
    let suffix = 2;
    while (taken.has(candidate)) candidate = `${name || "Untitled"} copy ${suffix++}`;
    taken.add(candidate);
    return candidate;
}

/**
 * Collect the complete object graph before mutation, via the shared
 * dependency-graph service (issue #5135 §3) so duplication and Object
 * Manager's related selection can never disagree about what an object
 * references. The visited set makes shared Tables and cycles safe and
 * guarantees that every source object is represented at most once in the
 * resulting duplication plan.
 */
export function previewObjectDuplication(
    source: Y.Doc,
    primary: DuplicableObject,
    scope: DuplicationScope,
): DuplicationPreview {
    const graph = buildObjectDependencyGraph(source);
    const objects = scope === "item-only"
        ? [primary]
        : traverseObjectGraph(graph, [primary], DIRECTION_BY_SCOPE[scope]);

    const visitedKeys = new Set(objects.map(key));
    let omittedReferenceCount = 0;
    for (const object of objects) {
        for (const dependency of graph.dependenciesOf(object)) {
            if (!visitedKeys.has(key(dependency))) omittedReferenceCount++;
        }
    }
    return { objects, omittedReferenceCount };
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
    const createdCalendars: string[] = [];
    const tableNames = new Set(listTables(destination).map(table => table.name));
    const gridNames = new Set(listGrids(destination).map(grid => grid.name));
    const sqlNames = new Set(listTables(destination).map(table => table.sqlName));
    const scheduleNames = new Set<string>();
    schedulesMapOf(destination).forEach(rule => {
        const name = rule.get("name");
        if (typeof name === "string" && name) scheduleNames.add(name);
    });
    const sqlNameMap = new Map<string, string>();
    const sourceProject = Project.fromDoc(source);
    const destinationProject = Project.fromDoc(destination);
    const calendarNames = new Set(listCalendars(destinationProject).map(entry => entry.settings.name));
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
                showAddRowButton: getGridShowAddRowButton(handles),
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

        // A Calendar owns no row data of its own — its definition/view
        // settings are copied wholesale, and its only Table reference is the
        // relations its query reads, rewritten through `sqlNameMap` exactly
        // like a Grid's query (issue #5135 §5). Placement is deliberately
        // never copied here: duplication only ever creates the Calendar
        // definition, and a destination Page is attached only by a caller
        // that explicitly asks for one (mirroring how a Grid's placement is
        // appended by `ObjectDuplicationDialog`, not by this function).
        for (const object of preview.objects.filter(object => object.type === "calendar")) {
            const sourceSettings = getCalendar(sourceProject, object.id);
            if (!sourceSettings) throw new Error(`Calendar "${object.id}" no longer exists`);
            const destinationId = idMap.get(key(object))!;
            const queryRewrite = rewriteTableQuerySql(sourceSettings.query, sqlNameMap);
            const omittedQueryReferences = queryRewrite.relationDependencies
                .filter(sqlName => !sqlNameMap.has(sqlName));
            const targetQuery = !sameProject && omittedQueryReferences.length > 0 ? "" : queryRewrite.sql;
            if (!sameProject) removedReferenceCount += omittedQueryReferences.length;
            createCalendar(destinationProject, {
                ...sourceSettings,
                calendarId: destinationId,
                name: allocateCopyName(sourceSettings.name, calendarNames),
                query: targetQuery,
            });
            createdCalendars.push(destinationId);
        }
    } catch (error) {
        destination.transact(() => {
            for (const calendarId of createdCalendars) destinationProject.calendars.delete(calendarId);
            for (const ruleId of createdSchedules) schedulesMapOf(destination).delete(ruleId);
            for (const gridId of createdGrids) getGridRegistry(destination).delete(gridId);
            for (const tableId of createdTables) removeTable(destination, tableId);
        });
        throw error;
    } finally {
        await Promise.allSettled(connections.map(connection => connection.dispose()));
    }

    return {
        idMap,
        primaryId: idMap.get(key(primary))!,
        removedReferenceCount,
        createdObjects: [
            ...createdTables.map(id => ({ type: "table" as const, id })),
            ...createdGrids.map(id => ({ type: "grid" as const, id })),
            ...createdSchedules.map(id => ({ type: "schedule" as const, id })),
            ...createdCalendars.map(id => ({ type: "calendar" as const, id })),
        ],
    };
}
