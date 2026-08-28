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

interface MaterializedDuplication {
    idMap: ReadonlyMap<string, string>;
    removedReferenceCount: number;
    createdObjects: DuplicableObject[];
}

export interface DuplicationResult extends MaterializedDuplication {
    primaryId: string;
}

export interface DuplicationOptions {
    copyTableData?: boolean;
    /** Synchronize source and newly-created cross-project Table subdocs. */
    synchronizeTableSubdocs?: boolean;
}

/** Result of duplicating an explicit selection (issue #5153) — there is no single primary object. */
export interface DuplicationSetResult extends MaterializedDuplication {
    /** The deduped source-side objects actually duplicated, in materialization order — reused to redo the operation with the same `idMap`. */
    sourceObjects: DuplicableObject[];
}

/** Remove every object materialized by one duplication attempt. */
export function rollbackObjectDuplication(
    destination: Y.Doc,
    result: Pick<MaterializedDuplication, "createdObjects">,
): void {
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

/** Every reference from `objects` that points outside the set counts once toward the returned preview. */
function toPreview(
    objects: DuplicableObject[],
    graph: ReturnType<typeof buildObjectDependencyGraph>,
): DuplicationPreview {
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
    return toPreview(objects, graph);
}

/**
 * Preview for an explicit, caller-provided object set (issue #5153) rather
 * than a graph traversal from one primary object — the selection itself is
 * the authoritative duplication scope, so this never expands it. A reference
 * from a selected object to another selected object will be rewritten to the
 * copy during materialization; a reference to an object outside the set is
 * counted here exactly like `previewObjectDuplication`'s omitted references,
 * so a caller can warn about it before the same-project-preserve /
 * cross-project-clear policy in `duplicateObjectSet` applies it.
 */
export function previewObjectSetDuplication(source: Y.Doc, selected: DuplicableObject[]): DuplicationPreview {
    const graph = buildObjectDependencyGraph(source);
    const seen = new Set<string>();
    const objects = selected.filter(object => {
        const objectKey = key(object);
        if (seen.has(objectKey)) return false;
        seen.add(objectKey);
        return true;
    });
    return toPreview(objects, graph);
}

/**
 * Materialize a previously previewed graph. IDs are allocated up front and
 * references are rewritten only against that map. On failure all registry
 * entries made by this invocation are removed, so observers never retain a
 * partially copied graph. Shared by both the single-primary recursive
 * duplication flow and the explicit-selection flow (issue #5153) — neither
 * re-expands `objects`, so a reference to something outside it is always
 * either rewritten (if included) or handled by the existing same-project
 * preserve / cross-project clear-and-warn policy below.
 */
export async function materializeDuplicationPlan(
    source: Y.Doc,
    destination: Y.Doc,
    objects: DuplicableObject[],
    options: DuplicationOptions = {},
    /**
     * Reuse a previously allocated id map instead of minting new destination
     * ids — how Object Manager's `Duplicate selected` redoes an undone
     * operation (issue #5153 §9): every id stays the same across an
     * undo/redo cycle, so anything a user pointed at a duplicated object
     * (e.g. by hand) between the redo and any later undo keeps resolving.
     * Every entry in `objects` must have a matching `objectGraphKey` here.
     */
    existingIdMap?: ReadonlyMap<string, string>,
): Promise<MaterializedDuplication> {
    const tableObjects = objects.filter(object => object.type === "table");
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
    const idMap = new Map<string, string>(existingIdMap);
    for (const object of objects) if (!idMap.has(key(object))) idMap.set(key(object), uuidv4());

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
        for (const object of objects.filter(object => object.type === "table")) {
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

        for (const object of objects.filter(object => object.type === "grid")) {
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
        for (const object of objects.filter(object => object.type === "schedule")) {
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
        for (const object of objects.filter(object => object.type === "calendar")) {
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

        // A Table's registry entry belongs to the project doc, but its schema
        // and rows belong to a separate room. In a cross-project operation the
        // new subdoc is not otherwise mounted, so explicitly connect every
        // created Table to the *destination* project room and wait for the
        // provider's sync handshake before reporting success or navigating.
        if (options.synchronizeTableSubdocs && !sameProject) {
            const { connectTableDoc } = await import("../../lib/yjs/connection");
            for (const tableId of createdTables) {
                const entry = listTables(destination).find(table => table.tableId === tableId);
                const handles = getTableHandles(destination, tableId);
                if (!entry || !handles) throw new Error(`Table "${tableId}" no longer exists`);
                try {
                    const connection = await connectTableDoc(destination.guid, tableId, handles.doc);
                    connections.push(connection);
                    const { synced } = await connection.waitForInitialSync();
                    if (!synced) throw new Error("initial synchronization timed out");
                } catch (error) {
                    throw new Error(
                        `Table "${entry.name || entry.sqlName || tableId}" could not be persisted.`,
                        { cause: error },
                    );
                }
            }
        }
    } catch (error) {
        // Stop providers before destroying their subdocs during rollback.
        await Promise.allSettled(connections.map(connection => connection.dispose()));
        connections.length = 0;
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
        removedReferenceCount,
        createdObjects: [
            ...createdTables.map(id => ({ type: "table" as const, id })),
            ...createdGrids.map(id => ({ type: "grid" as const, id })),
            ...createdSchedules.map(id => ({ type: "schedule" as const, id })),
            ...createdCalendars.map(id => ({ type: "calendar" as const, id })),
        ],
    };
}

/** Duplicate one primary object and everything `scope` pulls in via the shared dependency graph. */
export async function duplicateObjects(
    source: Y.Doc,
    destination: Y.Doc,
    primary: DuplicableObject,
    scope: DuplicationScope,
    options: DuplicationOptions = {},
): Promise<DuplicationResult> {
    const preview = previewObjectDuplication(source, primary, scope);
    const materialized = await materializeDuplicationPlan(source, destination, preview.objects, options);
    return { ...materialized, primaryId: materialized.idMap.get(key(primary))! };
}

/**
 * Duplicate an explicit, caller-provided object set (issue #5153 — Object
 * Manager's `Duplicate selected`). Unlike `duplicateObjects`, the set is never
 * expanded through the dependency graph: a reference from a selected object
 * to another selected object is rewritten to the copy (via `idMap`, exactly
 * like the single-primary flow), while a reference to an object outside the
 * selection follows the existing same-project-preserve /
 * cross-project-clear-and-warn policy already implemented in
 * `materializeDuplicationPlan`. Callers that want related objects included
 * must add them to `selected` themselves (e.g. via Object Manager's
 * `Select related`) before calling this.
 */
export async function duplicateObjectSet(
    source: Y.Doc,
    destination: Y.Doc,
    selected: DuplicableObject[],
    options: DuplicationOptions = {},
): Promise<DuplicationSetResult> {
    const preview = previewObjectSetDuplication(source, selected);
    const materialized = await materializeDuplicationPlan(source, destination, preview.objects, options);
    return { ...materialized, sourceObjects: preview.objects };
}
