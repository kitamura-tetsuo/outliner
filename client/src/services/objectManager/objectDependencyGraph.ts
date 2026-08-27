// Shared object dependency graph (issue #5135 §3): the single traversal used
// by both recursive object duplication (`yjstable/objectDuplication.ts`) and
// Object Manager's dependency-aware "Select related" action. Edges are
// discovered only from explicit object relationships — a Grid/Schedule's
// `sourceTableId`/`targetTableId` plus the relations its SQL text actually
// reads or writes (`rewriteTableQuerySql`'s FROM/JOIN/DML-target scan, never
// bare identifier matching) — and now a Calendar's `query` the same way.
// Outline Page placements are never edges here.

import { Project } from "$shared/app-schema";
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import * as Y from "yjs";
import { listCalendars } from "../calendar/calendarService";
import { getGridHandles, listGrids } from "../yjstable/gridDocs";
import { listTables } from "../yjstable/tableDocs";
import { rewriteTableQuerySql } from "../yjstable/tableSqlRewrite";

export type ObjectKind = "grid" | "table" | "schedule" | "calendar";

export interface GraphObject {
    type: ObjectKind;
    id: string;
}

/** `dependencies` = what a root references; `dependents` = what references a root; `connected` = both, recursively. */
export type GraphDirection = "dependencies" | "dependents" | "connected";

export function objectGraphKey(object: GraphObject): string {
    return `${object.type}:${object.id}`;
}

export interface ObjectDependencyGraph {
    /** Objects `object` explicitly references (currently always Tables). */
    dependenciesOf(object: GraphObject): GraphObject[];
    /** Objects that explicitly reference `object`. */
    dependentsOf(object: GraphObject): GraphObject[];
}

function schedulesMapOf(doc: Y.Doc): Y.Map<Y.Map<ScheduleRuleValueType>> {
    return doc.getMap("schedules") as Y.Map<Y.Map<ScheduleRuleValueType>>;
}

/**
 * Build the complete explicit-reference graph for one project document. Read
 * once and reused for every traversal a caller performs against it, mirroring
 * the discovery pass `objectDuplication.ts` used to run inline.
 */
export function buildObjectDependencyGraph(doc: Y.Doc): ObjectDependencyGraph {
    const project = Project.fromDoc(doc);
    const tableEntries = listTables(doc);
    const tableIds = new Set(tableEntries.map(table => table.tableId));
    const tableBySqlName = new Map(tableEntries.map(table => [table.sqlName, table.tableId]));

    const forward = new Map<string, GraphObject[]>();
    const reverse = new Map<string, GraphObject[]>();

    const addEdge = (from: GraphObject, to: GraphObject) => {
        const forwardKey = objectGraphKey(from);
        const forwardList = forward.get(forwardKey) ?? [];
        if (!forwardList.some(existing => objectGraphKey(existing) === objectGraphKey(to))) {
            forwardList.push(to);
            forward.set(forwardKey, forwardList);
        }

        const reverseKey = objectGraphKey(to);
        const reverseList = reverse.get(reverseKey) ?? [];
        if (!reverseList.some(existing => objectGraphKey(existing) === objectGraphKey(from))) {
            reverseList.push(from);
            reverse.set(reverseKey, reverseList);
        }
    };

    /** Table ids read by a SQL/query string, via relation-level parsing only. */
    function relationTableIds(sql: string): string[] {
        try {
            return rewriteTableQuerySql(sql, new Map()).relationDependencies
                .map(sqlName => tableBySqlName.get(sqlName))
                .filter((tableId): tableId is string => tableId !== undefined);
        } catch {
            // An invalid query/statement stays part of the graph via its
            // explicit reference (sourceTableId/targetTableId, if any); only
            // the SQL-derived edges are unavailable until it is fixed.
            return [];
        }
    }

    for (const grid of listGrids(doc)) {
        const gridObject: GraphObject = { type: "grid", id: grid.gridId };
        const references = new Set<string>();
        if (grid.sourceTableId) references.add(grid.sourceTableId);
        const handles = getGridHandles(doc, grid.gridId);
        const query = String(handles?.entry.get("query") ?? "");
        for (const tableId of relationTableIds(query)) references.add(tableId);
        for (const tableId of references) {
            if (tableIds.has(tableId)) addEdge(gridObject, { type: "table", id: tableId });
        }
    }

    schedulesMapOf(doc).forEach((rule, ruleId) => {
        const scheduleObject: GraphObject = { type: "schedule", id: ruleId };
        const references = new Set<string>();
        const targetTableId = rule.get("targetTableId");
        if (typeof targetTableId === "string" && targetTableId && tableIds.has(targetTableId)) {
            references.add(targetTableId);
        }
        for (const tableId of relationTableIds(String(rule.get("sql") ?? ""))) references.add(tableId);
        for (const tableId of references) addEdge(scheduleObject, { type: "table", id: tableId });
    });

    // Calendar (issue #5135 §4): owns no row data of its own, so its only
    // dependency is whatever Tables its query reads.
    for (const calendar of listCalendars(project)) {
        const calendarObject: GraphObject = { type: "calendar", id: calendar.id };
        for (const tableId of relationTableIds(calendar.settings.query)) {
            if (tableIds.has(tableId)) addEdge(calendarObject, { type: "table", id: tableId });
        }
    }

    return {
        dependenciesOf: object => forward.get(objectGraphKey(object)) ?? [],
        dependentsOf: object => reverse.get(objectGraphKey(object)) ?? [],
    };
}

/**
 * BFS union closure over one or more traversal roots (issue #5135 §2/§3):
 * every root is a starting point, the result is the union of all traversals,
 * each object appears at most once, and the visited set makes cycles and
 * shared dependencies safe. The returned list always includes the roots.
 */
export function traverseObjectGraph(
    graph: ObjectDependencyGraph,
    roots: GraphObject[],
    direction: GraphDirection,
): GraphObject[] {
    const visited = new Map<string, GraphObject>();
    const queue: GraphObject[] = [...roots];
    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentKey = objectGraphKey(current);
        if (visited.has(currentKey)) continue;
        visited.set(currentKey, current);

        const next = direction === "dependencies"
            ? graph.dependenciesOf(current)
            : direction === "dependents"
            ? graph.dependentsOf(current)
            : [...graph.dependenciesOf(current), ...graph.dependentsOf(current)];
        for (const object of next) queue.push(object);
    }
    return [...visited.values()];
}
