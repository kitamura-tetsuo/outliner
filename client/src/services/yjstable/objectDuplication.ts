import { Project } from "$shared/app-schema";
import { structuralSqlRelationReferences } from "$shared/services/sqlEnvironmentCompiler";
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
    getGridConfirmRowDelete,
    getGridHandles,
    getGridInsertTargetTableId,
    getGridRegistry,
    getGridShowAddRowButton,
    isValidGridColumnWidth,
} from "./gridDocs";
import { queryReadDependencies } from "./queryReadDependencies";
import { deriveSqlName } from "./sqlNames";
import {
    assertStructuralEnumCompatibility,
    captureStructuralSqlSnapshot,
    type StructuralEnumAdmission,
    structuralEnumAdmissionStillCompatible,
} from "./structuralEnumGuard";
import {
    createTable,
    getTableHandles,
    getTableRegistry,
    listTables,
    removeTable,
    type TableRecordValue,
} from "./tableDocs";
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
    unknownObjects: DuplicableObject[];
    preferenceOmissions: { gridId: string; tableId: string; }[];
}

interface MaterializedDuplication {
    idMap: ReadonlyMap<string, string>;
    removedReferenceCount: number;
    createdObjects: DuplicableObject[];
    diagnostics: string[];
    ownership: ObjectOwnership[];
    enumAdmission: StructuralEnumAdmission;
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

/** Transient creation-time evidence, never persisted as ownership metadata. */
export interface ObjectOwnership {
    object: DuplicableObject;
    entry: unknown;
    subdoc: unknown;
}
function objectRegistry(doc: Y.Doc, type: DuplicableObject["type"]): Y.Map<unknown> {
    return doc.getMap(
        type === "grid" ? "yjsGrids" : type === "table"
            ? "yjsTables"
            : type === "calendar"
            ? "calendars"
            : "schedules",
    );
}
function ownsObject(doc: Y.Doc, witness: ObjectOwnership): boolean {
    const entry = objectRegistry(doc, witness.object.type).get(witness.object.id);
    return entry === witness.entry && (witness.object.type !== "table"
        || (entry instanceof Y.Map && entry.get("doc") === witness.subdoc));
}
export function assertDuplicationOwnership(doc: Y.Doc, result: Pick<MaterializedDuplication, "ownership">): void {
    if (result.ownership.some(witness => !ownsObject(doc, witness))) {
        throw new Error("A duplicated object was replaced or removed");
    }
}
/** Failure cleanup removes only entries still owned by this invocation. User
 * Undo must first validate the entire set, before any placement side effect. */
export function rollbackObjectDuplication(
    destination: Y.Doc,
    result: Pick<MaterializedDuplication, "ownership">,
): void {
    destination.transact(() => {
        for (const witness of result.ownership.toReversed()) {
            if (!ownsObject(destination, witness)) continue;
            if (witness.object.type === "table") removeTable(destination, witness.object.id);
            else objectRegistry(destination, witness.object.type).delete(witness.object.id);
        }
    });
}

const key = objectGraphKey;

function allocateCopyName(name: string, taken: Set<string>, sameProject: boolean): string {
    let candidate = name || "Untitled";
    if (!sameProject && !taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
    }
    candidate = `${candidate} copy`;
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
    return {
        objects,
        omittedReferenceCount,
        unknownObjects: objects.filter(object => graph.analysisOf(object)?.status === "unknown"),
        preferenceOmissions: [],
    };
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
    const preview = toPreview(objects, graph);
    preview.preferenceOmissions = preferenceOmissions(source, objects);
    if ("incomplete" in objects) preview.unknownObjects = objects.incomplete as DuplicableObject[];
    return preview;
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
    return { ...toPreview(objects, graph), preferenceOmissions: preferenceOmissions(source, objects) };
}

function preferenceOmissions(source: Y.Doc, objects: DuplicableObject[]): { gridId: string; tableId: string; }[] {
    const selectedTables = new Set(objects.filter(object => object.type === "table").map(object => object.id));
    return objects.flatMap(object => {
        if (object.type !== "grid") return [];
        const entry = getGridRegistry(source).get(object.id);
        const tableId = entry ? getGridInsertTargetTableId({ entry }) : undefined;
        return tableId && !selectedTables.has(tableId) ? [{ gridId: object.id, tableId }] : [];
    });
}

/** Capture only the source facts used by a delayed duplication, excluding row
 * and presentation edits, which remain live and belong to their own writers. */
export function captureDuplicationAdmission(source: Y.Doc, objects: DuplicableObject[]): () => void {
    const tables = getTableRegistry(source);
    const grids = getGridRegistry(source);
    const facts = objects.map(object => {
        const registry = object.type === "table" ? tables : object.type === "grid"
            ? grids
            : source.getMap(
                object.type === "schedule" ? "schedules" : object.type === "calendar" ? "calendars" : "yjsKanbans",
            );
        const entry = registry.get(object.id) as Y.Map<unknown> | undefined;
        if (!entry) throw new Error(`${object.type} "${object.id}" no longer exists`);
        const query = entry.get(object.type === "schedule" ? "sql" : "query");
        const preference = entry.get("insertTargetTableId");
        const reads = object.type === "grid" ? queryReadDependencies(source, String(query ?? "")) : undefined;
        const dependencies = (reads?.tableIds ?? []).map(id => ({
            id,
            entry: tables.get(id),
            sqlName: tables.get(id)?.get("sqlName"),
        }));
        const doc = entry.get("doc");
        const sqlName = entry.get("sqlName");
        return () =>
            registry.get(object.id) === entry && entry.get("doc") === doc && entry.get("sqlName") === sqlName
            && entry.get(object.type === "schedule" ? "sql" : "query") === query
            && entry.get("insertTargetTableId") === preference
            && dependencies.every(dependency =>
                tables.get(dependency.id) === dependency.entry
                && dependency.entry?.get("sqlName") === dependency.sqlName
            )
            && (!reads || JSON.stringify(queryReadDependencies(source, String(query ?? ""))) === JSON.stringify(reads));
    });
    return () => {
        if (!facts.every(current => current())) {
            throw new Error("The source view, query or Table identity changed while duplication was pending.");
        }
    };
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
    replayAdmission?: StructuralEnumAdmission,
): Promise<MaterializedDuplication> {
    // Capture dependency authority before the first await. The guard compiles
    // actual schemas/queries and rechecks these snapshots immediately before
    // any registry, subdoc, placement or history-visible effect.
    if (objects.some(object => object.type === "kanban")) {
        throw new Error("Kanban structural duplication is unsupported.");
    }
    const assertCurrent = captureDuplicationAdmission(source, objects);
    let sqlSnapshot = captureStructuralSqlSnapshot(source);
    const tableObjects = objects.filter(object => object.type === "table");
    const hydrationTableIds = new Set(tableObjects.map(object => object.id));
    const addHydrationInputs = (sql: string) => {
        if (!sql.trim()) return;
        // Use the analyzer's scoped AST inventory for physical relations.
        // CTE aliases are not Tables, while public-qualified references
        // still need their real subdocuments hydrated before admission.
        const relations = structuralSqlRelationReferences(sql);
        for (const table of listTables(source)) {
            if (
                relations.some(relation =>
                    (relation.schema === undefined || relation.schema === "public")
                    && relation.name === table.sqlName
                )
            ) hydrationTableIds.add(table.tableId);
        }
    };
    for (const object of objects) {
        let sql: string | undefined;
        if (object.type === "grid") sql = String(getGridHandles(source, object.id)?.entry.get("query") ?? "");
        else if (object.type === "calendar") sql = getCalendar(Project.fromDoc(source), object.id)?.query;
        else if (object.type === "schedule") {
            const rule = schedulesMapOf(source).get(object.id);
            sql = String(rule?.get("sql") ?? "");
            const targetTableId = rule?.get("targetTableId");
            if (typeof targetTableId === "string" && targetTableId) hydrationTableIds.add(targetTableId);
        }
        if (sql?.trim()) {
            // Preserve the transfer rewriter's syntax contract before the
            // shared analyzer inventories inputs for hydration.
            rewriteTableQuerySql(sql, new Map());
            addHydrationInputs(sql);
        }
    }
    const connections: TableDocConnection[] = [];

    // The selected object graph is fixed, but cold schemas may reveal further
    // inputs such as foreign-key targets. Hydrate that closure without adding
    // objects to the transfer, before schema rewriting or row copying starts.
    if (options.synchronizeTableSubdocs && hydrationTableIds.size > 0) {
        const { connectTableDoc } = await import("../../lib/yjs/connection");
        try {
            for (const tableId of hydrationTableIds) {
                const entry = listTables(source).find(table => table.tableId === tableId);
                const handles = getTableHandles(source, tableId);
                if (!entry || !handles) throw new Error(`Table "${tableId}" no longer exists`);
                try {
                    // The project document GUID is the room id. The route's
                    // `sourceProject` value is only its human-readable title
                    // and cannot authorize a Table room connection.
                    const connection = await connectTableDoc(source.guid, tableId, handles.doc);
                    connections.push(connection);
                    const { synced } = await connection.waitForInitialSync();
                    if (!synced) throw new Error("initial synchronization timed out");
                } catch (error) {
                    throw new Error(
                        `Table "${entry.name || entry.sqlName || tableId}" could not be synchronized.`,
                        { cause: error },
                    );
                }
                // Set iteration visits newly discovered inputs and deduplicates
                // cycles, including a self-referencing foreign key.
                addHydrationInputs(handles.schemaText.toString());
            }
        } catch (error) {
            await Promise.allSettled(connections.map(connection => connection.dispose()));
            throw error;
        }
    }
    // Always admit the captured SQL, even when the catalog is empty: a typed
    // schema with unavailable declarations is unresolved evidence, not proof
    // that the transfer is catalog-independent.
    const availableSqlIds = new Set([
        ...sqlSnapshot.tables.map(table => table.id),
        ...sqlSnapshot.inspections.map(inspection => inspection.id),
    ]);
    const relevantSqlIds = new Set(objects.map(object => object.id).filter(id => availableSqlIds.has(id)));
    const idMap = new Map<string, string>(existingIdMap);
    let enumAdmission!: StructuralEnumAdmission;
    try {
        // Table room synchronization can reveal schema and records that were
        // absent from the registry-attached shell. Recapture inside this
        // cleanup boundary so unavailable evidence also releases Table rooms.
        if (options.synchronizeTableSubdocs && hydrationTableIds.size > 0) {
            sqlSnapshot = captureStructuralSqlSnapshot(source);
        }
        // Syntax admission must precede even read-like destination helper
        // calls: obtaining an absent Yjs root type can publish an update.
        for (const object of tableObjects) {
            const entry = listTables(source).find(table => table.tableId === object.id);
            const snapshot = sqlSnapshot.tables.find(table => table.id === object.id);
            if (!entry || !snapshot) throw new Error(`Table "${object.id}" no longer exists`);
            rewriteCreateTableSql(snapshot.schema, entry.sqlName, entry.sqlName);
        }
        for (const inspection of sqlSnapshot.inspections) {
            if (relevantSqlIds.has(inspection.id)) rewriteTableQuerySql(inspection.sql, new Map());
        }
        enumAdmission = await assertStructuralEnumCompatibility(source, destination, sqlSnapshot, relevantSqlIds);
        assertCurrent();
        if (replayAdmission && !structuralEnumAdmissionStillCompatible(source, destination, replayAdmission)) {
            throw new Error("SQL ENUM admission changed since duplication.");
        }
        for (const object of objects) if (!idMap.has(key(object))) idMap.set(key(object), uuidv4());
    } catch (error) {
        await Promise.allSettled(connections.map(connection => connection.dispose()));
        throw error;
    }
    const sameProject = source === destination;
    const ownership: ObjectOwnership[] = [];
    const captureOwned = (type: DuplicableObject["type"], id: string) => {
        const entry = objectRegistry(destination, type).get(id);
        ownership.push({
            object: { type, id },
            entry,
            subdoc: type === "table" && entry instanceof Y.Map ? entry.get("doc") : undefined,
        });
    };
    const createdTables: string[] = [];
    const createdGrids: string[] = [];
    const createdSchedules: string[] = [];
    const createdCalendars: string[] = [];
    const tableNames = new Set(listTables(destination).map(table => table.name));
    const gridNames = new Set(
        [...getGridRegistry(destination).values()].map(entry => String(entry.get("name") ?? "Grid")),
    );
    const sqlNames = new Set(listTables(destination).map(table => table.sqlName));
    const scheduleNames = new Set<string>();
    schedulesMapOf(destination).forEach(rule => {
        const name = rule.get("name");
        if (typeof name === "string" && name) scheduleNames.add(name);
    });
    const sqlNameMap = new Map<string, string>();
    const sourceProject = Project.fromDoc(source);
    let removedReferenceCount = 0;
    const diagnostics: string[] = [];

    // Build and validate the complete required SQL plan before the first
    // destination registry/subdoc effect. Rollback cannot retract Yjs events
    // already observed by peers, so parsing later in the creation loops would
    // not satisfy admission-before-publication.
    const destinationSqlNames = new Map<string, string>();
    const rewrittenSchemas = new Map<string, string>();
    try {
        for (const object of tableObjects) {
            const sourceEntry = listTables(source).find(table => table.tableId === object.id);
            const sourceHandles = getTableHandles(source, object.id);
            if (!sourceEntry || !sourceHandles) throw new Error(`Table "${object.id}" no longer exists`);
            const destinationSqlName = deriveSqlName(sourceEntry.sqlName, sqlNames);
            sqlNames.add(destinationSqlName);
            sqlNameMap.set(sourceEntry.sqlName, destinationSqlName);
            destinationSqlNames.set(object.id, destinationSqlName);
            rewrittenSchemas.set(
                object.id,
                rewriteCreateTableSql(sourceHandles.schemaText.toString(), sourceEntry.sqlName, destinationSqlName).sql,
            );
        }
        for (const object of objects) {
            if (object.type === "grid") {
                const query = String(getGridHandles(source, object.id)?.entry.get("query") ?? "");
                if (query.trim()) rewriteTableQuerySql(query, sqlNameMap);
            } else if (object.type === "schedule") {
                const sql = String(schedulesMapOf(source).get(object.id)?.get("sql") ?? "");
                if (sql.trim()) rewriteTableQuerySql(sql, sqlNameMap);
            } else if (object.type === "calendar") {
                const query = getCalendar(sourceProject, object.id)?.query ?? "";
                if (query.trim()) rewriteTableQuerySql(query, sqlNameMap);
            }
        }
        for (const object of objects) {
            const registry = destination.getMap(
                object.type === "table"
                    ? "yjsTables"
                    : object.type === "grid"
                    ? "yjsGrids"
                    : object.type === "calendar"
                    ? "calendars"
                    : "schedules",
            );
            if (registry.has(idMap.get(key(object))!)) throw new Error("A destination identity is already occupied.");
        }
    } catch (error) {
        await Promise.allSettled(connections.map(connection => connection.dispose()));
        throw error;
    }
    const destinationProject = Project.fromDoc(destination);
    const calendarNames = new Set(listCalendars(destinationProject).map(entry => entry.settings.name));

    try {
        // Tables precede Grids, but both kinds already have destination IDs.
        for (const object of objects.filter(object => object.type === "table")) {
            const sourceEntry = listTables(source).find(table => table.tableId === object.id);
            const sourceHandles = getTableHandles(source, object.id);
            if (!sourceEntry || !sourceHandles) throw new Error(`Table "${object.id}" no longer exists`);
            const destinationId = idMap.get(key(object))!;
            const destinationSqlName = destinationSqlNames.get(object.id)!;
            const schema = rewrittenSchemas.get(object.id)!;
            createTable(destination, allocateCopyName(sourceEntry.name, tableNames, sameProject), destinationSqlName, {
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
            captureOwned("table", destinationId);
        }

        for (const object of objects.filter(object => object.type === "grid")) {
            const sourceGrid = getGridRegistry(source).get(object.id);
            const handles = getGridHandles(source, object.id);
            if (!sourceGrid || !handles) throw new Error(`Grid "${object.id}" no longer exists`);
            // Null-prototype so an exact result-column name such as
            // "__proto__" is an ordinary own key, not a prototype assignment.
            const components: Record<string, { type?: string; label?: string; hidden?: boolean; widthPx?: number; }> =
                Object.create(null);
            handles.components.forEach((component, column) => {
                // Saved width overrides duplicate with the definition;
                // malformed values read as automatic sizing and never fail
                // the duplication.
                const widthPx = component.get("widthPx");
                components[column] = {
                    type: component.get("type") as string | undefined,
                    label: component.get("label") as string | undefined,
                    hidden: component.get("hidden") as boolean | undefined,
                    ...(isValidGridColumnWidth(widthPx) ? { widthPx } : {}),
                };
            });
            const destinationId = idMap.get(key(object))!;
            const sourceQuery = String(handles.entry.get("query") ?? "");
            // Blank queries are unconfigured state, matching the compiler's
            // complete-empty evidence. Preserve their original text.
            const hasQuery = sourceQuery.trim().length > 0;
            const rewrittenQuery = hasQuery ? rewriteTableQuerySql(sourceQuery, sqlNameMap).sql : sourceQuery;
            const reads = queryReadDependencies(source, sourceQuery);
            const omittedQueryReferences = reads.relationNames
                .filter(sqlName => sqlName !== "outline_items" && !sqlNameMap.has(sqlName));
            const targetQuery = hasQuery && !sameProject
                    && (omittedQueryReferences.length > 0 || reads.status === "unknown")
                ? ""
                : rewrittenQuery;
            if (!sameProject) removedReferenceCount += omittedQueryReferences.length;
            const preference = getGridInsertTargetTableId(handles);
            const mappedPreference = preference
                ? idMap.get(key({ type: "table", id: preference })) ?? (sameProject ? preference : undefined)
                : undefined;
            if (preference && !mappedPreference) {
                removedReferenceCount++;
                diagnostics.push(`Grid ${object.id}: cleared unmappable INSERT preference ${preference}`);
            }
            if (!sameProject && targetQuery === "" && hasQuery) {
                diagnostics.push(
                    `Grid ${object.id}: query unavailable because read dependencies were omitted or unknown`,
                );
            }
            createGrid(destination, {
                gridId: destinationId,
                name: allocateCopyName(String(sourceGrid.get("name") ?? "Grid"), gridNames, sameProject),
                query: targetQuery,
                columnOrder: getGridColumnOrder(handles),
                components,
                showAddRowButton: getGridShowAddRowButton(handles),
                confirmRowDelete: getGridConfirmRowDelete(handles),
                insertTargetTableId: mappedPreference,
            });
            createdGrids.push(destinationId);
            captureOwned("grid", destinationId);
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
            // Blank SQL denotes an unconfigured Schedule. Actual statements
            // must still pass parsing and rewriting before publication.
            const sqlRewrite = sourceSql.trim() ? rewriteTableQuerySql(sourceSql, sqlNameMap) : undefined;
            const omittedSqlReferences = (sqlRewrite?.relationDependencies ?? [])
                .filter(sqlName => sqlName !== "outline_items" && !sqlNameMap.has(sqlName));
            const targetSql = !sameProject && omittedSqlReferences.length > 0 ? "" : sqlRewrite?.sql ?? sourceSql;
            if (!sameProject) removedReferenceCount += omittedSqlReferences.length;

            const sourceName = (ruleMap.get("name") as string | undefined) || "Untitled Schedule";
            const destinationId = idMap.get(key(object))!;
            const dtstart = ruleMap.get("dtstart");
            const timezone = ruleMap.get("timezone");
            createScheduleRule(destinationProject, {
                ruleId: destinationId,
                name: allocateCopyName(sourceName, scheduleNames, sameProject),
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
            captureOwned("schedule", destinationId);
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
            // Blank query is a valid unconfigured Calendar state. Any actual
            // query must pass the same parser preflight as Grid definitions.
            const rewrittenQuery = sourceSettings.query.trim()
                ? rewriteTableQuerySql(sourceSettings.query, sqlNameMap).sql
                : sourceSettings.query;
            const reads = queryReadDependencies(source, sourceSettings.query);
            const omittedQueryReferences = reads.relationNames
                .filter(sqlName => sqlName !== "outline_items" && !sqlNameMap.has(sqlName));
            const targetQuery = !sameProject && omittedQueryReferences.length > 0 ? "" : rewrittenQuery;
            if (!sameProject) removedReferenceCount += omittedQueryReferences.length;
            createCalendar(destinationProject, {
                ...sourceSettings,
                calendarId: destinationId,
                name: allocateCopyName(sourceSettings.name, calendarNames, sameProject),
                query: targetQuery,
            });
            createdCalendars.push(destinationId);
            captureOwned("calendar", destinationId);
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
        rollbackObjectDuplication(destination, { ownership });
        throw error;
    } finally {
        await Promise.allSettled(connections.map(connection => connection.dispose()));
    }

    try {
        assertCurrent();
        assertDuplicationOwnership(destination, { ownership });
    } catch (error) {
        rollbackObjectDuplication(destination, { ownership });
        throw error;
    }
    return {
        ownership,
        enumAdmission,
        idMap,
        removedReferenceCount,
        diagnostics,
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
    if (scope !== "item-only" && preview.unknownObjects.length) {
        throw new Error("Cannot determine a complete dependency scope: SQL read analysis is unknown.");
    }
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
