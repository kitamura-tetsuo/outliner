// What else in a project would notice if a Table disappeared.
//
// Everything here is a reference, never a child: views read Tables through
// parsed SQL, Schedules also name explicit write targets, and outline items
// place independent views. A Table owns its schema and
// its data and nothing else (issue #5012), so this module answers "used by",
// not "contains".

import * as Y from "yjs";
import { type Item, Project } from "../../../../shared/src/app-schema";
import type { ScheduleRuleValueType } from "../../../../shared/src/types/yjs-types";
import { buildObjectDependencyGraph, type GraphObject } from "../objectManager/objectDependencyGraph";
import { findSchedulesReferencingTable } from "../schedule/scheduleRuleService";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { destroyTableUndoManager, getTableRegistry } from "./tableDocs";
import { tableDocGuid } from "./tableDocs";

export interface TableDependencies {
    unknownReferences: { object: GraphObject; diagnostics: string[]; }[];
    directGridReferences: {
        pageId: string;
        pageTitle: string;
        itemId: string;
        itemText: string;
        itemKey: string;
        /** The Grid id the outline item is bound to (may reference our Table). */
        gridId?: string;
    }[];
    /**
     * Schedules whose write target is this Table. A subset of
     * `scheduleReferences`; deleting the Table with the
     * "remove-direct-references" policy deletes exactly these, because a
     * Schedule that can no longer write anywhere has nothing left to do.
     */
    scheduledTargets: {
        ruleId: string;
        ruleName: string;
    }[];
    /**
     * Every Schedule that references this Table, write target or read alike.
     * One Schedule may appear in several Tables' lists — it belongs to the
     * project, not to any one of them.
     */
    scheduleReferences: {
        ruleId: string;
        ruleName: string;
        kind: "write-target" | "sql-reference";
    }[];
    indirectSqlReferences: {
        type: "query" | "calendar" | "schedule" | "kanban";
        name: string;
    }[];
    /** Grids whose parsed SQL reads this Table. */
    dependentGridIds: string[];
    /** Kanbans whose parsed SQL reads this Table. */
    dependentKanbanIds: string[];
}

export function getTableDependencies(project: Project, tableId: string): TableDependencies {
    const scheduleReferences = findSchedulesReferencingTable(project, tableId);
    const graph = buildObjectDependencyGraph(project.ydoc);
    const readers = graph.dependentsOf({ type: "table", id: tableId });
    const dependencies: TableDependencies = {
        unknownReferences: graph.unknownObjects.map(object => ({
            object,
            diagnostics: graph.analysisOf(object)!.diagnostics,
        })),
        directGridReferences: [],
        scheduledTargets: scheduleReferences
            .filter(r => r.kind === "write-target")
            .map(({ ruleId, ruleName }) => ({ ruleId, ruleName })),
        scheduleReferences: scheduleReferences.map(({ ruleId, ruleName, kind }) => ({ ruleId, ruleName, kind })),
        indirectSqlReferences: [],
        dependentGridIds: readers.filter(object => object.type === "grid").map(object => object.id),
        dependentKanbanIds: readers.filter(object => object.type === "kanban").map(object => object.id),
    };

    const gridsOfTable = new Set(dependencies.dependentGridIds);

    // 1. Direct Grid References — outline items bound to a Grid whose source is this Table.
    function traverseItem(item: Item, page: Item, pageTitle: string) {
        try {
            const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown> | undefined;
            if (nodeValue && nodeValue.get("componentType") === "yjstable") {
                const boundGridId = nodeValue.get("yjsGridId");
                if (typeof boundGridId === "string" && gridsOfTable.has(boundGridId)) {
                    const itemText = (nodeValue.get("text") as Y.Text | undefined)?.toString() || "";
                    dependencies.directGridReferences.push({
                        pageId: page.id!,
                        pageTitle: pageTitle,
                        itemId: item.id!,
                        itemText: itemText,
                        itemKey: item.key!,
                        gridId: boundGridId,
                    });
                }
            }
        } catch (_e) {
            // Ignore missing node errors during iteration
        }
        for (const child of item.items) {
            if (child) traverseItem(child, page, pageTitle);
        }
    }

    const rootItems = project.items;
    for (const page of rootItems) {
        if (!page) continue;
        const pageTitle =
            (page.tree.getNodeValueFromKey(page.key) as Y.Map<unknown> | undefined)?.get("text")?.toString()
            || "Untitled Page";
        traverseItem(page, page, pageTitle);
    }

    // 2. Schedules that name this Table's relation in their SQL without
    // writing to it. The write targets are already in `scheduledTargets`;
    // these are the reads, reported as warnings because deleting the Table
    // breaks their statement without any reference to rewrite.
    for (const reference of scheduleReferences) {
        if (reference.kind !== "sql-reference") continue;
        dependencies.indirectSqlReferences.push({ type: "schedule", name: reference.ruleName });
    }

    for (const reader of readers) {
        if (reader.type === "calendar") {
            dependencies.indirectSqlReferences.push({
                type: "calendar",
                name: String(project.calendars.get(reader.id)?.get("name") ?? "Untitled Calendar"),
            });
        }
    }

    return dependencies;
}

export type DeleteTablePolicy = "keep-references" | "remove-direct-references";

export interface DeleteTableResult {
    deletedTableId: string;
    detachedGridCount: number;
    deletedGridCount: number;
    deletedScheduleCount: number;
    remainingIndirectWarnings: number;
}

export function removeTableWithPolicy(
    project: Project,
    tableId: string,
    policy: DeleteTablePolicy,
): DeleteTableResult | undefined {
    const registry = getTableRegistry(project.ydoc);
    const entry = registry.get(tableId);
    if (!entry) return undefined; // Idempotent if disappeared concurrently

    const doc = entry.get("doc");

    // Inventory must be taken before the transaction begins, or inside it
    const deps = getTableDependencies(project, tableId);

    const detachedGridCount = 0;
    const deletedGridCount = 0;
    let deletedScheduleCount = 0;

    project.ydoc.transact(() => {
        if (policy === "remove-direct-references") {
            // Remove direct Schedule references
            for (const ref of deps.scheduledTargets) {
                project.schedules.delete(ref.ruleId);
                deletedScheduleCount++;
            }
        }

        registry.delete(tableId);
    });

    // Destroy the subdocument after the transaction commits
    if (doc instanceof Y.Doc) {
        destroyTableUndoManager(doc);
        doc.destroy();
    }

    return {
        deletedTableId: tableId,
        detachedGridCount,
        deletedGridCount,
        deletedScheduleCount,
        remainingIndirectWarnings: deps.indirectSqlReferences.length,
    };
}

function yMapFromJson(value: Record<string, unknown>): Y.Map<unknown> {
    const map = new Y.Map<unknown>();
    for (const [key, child] of Object.entries(value)) {
        if (child && typeof child === "object" && !Array.isArray(child)) {
            map.set(key, yMapFromJson(child as Record<string, unknown>));
        } else map.set(key, child);
    }
    return map;
}

/** The authoritative Table delete policy wrapped in a complete manual undo entry. */
export function removeTableWithPolicyUndoable(project: Project, tableId: string): boolean {
    const registry = getTableRegistry(project.ydoc);
    const entry = registry.get(tableId);
    if (!entry) return false;
    const doc = entry.get("doc");
    if (!(doc instanceof Y.Doc)) return false;
    const metadata = entry.toJSON() as Record<string, unknown>;
    delete metadata.doc;
    const tableState = Y.encodeStateAsUpdate(doc);
    const deps = getTableDependencies(project, tableId);
    const schedules = new Map(deps.scheduledTargets.flatMap(({ ruleId }) => {
        const rule = project.schedules.get(ruleId);
        return rule ? [[ruleId, rule.toJSON() as Record<string, unknown>] as const] : [];
    }));

    let ownedEntry = entry;
    const applyDelete = () => {
        if (registry.get(tableId) !== ownedEntry) return;
        removeTableWithPolicy(project, tableId, "remove-direct-references");
    };
    const applyRestore = () =>
        project.ydoc.transact(() => {
            if (registry.has(tableId)) return;
            const restoredDoc = new Y.Doc({ guid: tableDocGuid(project.ydoc.guid, tableId), autoLoad: true });
            Y.applyUpdate(restoredDoc, tableState);
            const restoredEntry = yMapFromJson(metadata);
            restoredEntry.set("doc", restoredDoc);
            registry.set(tableId, restoredEntry);
            ownedEntry = restoredEntry;
            for (const [id, snapshot] of schedules) {
                if (!project.schedules.has(id)) {
                    project.schedules.set(id, yMapFromJson(snapshot) as Y.Map<ScheduleRuleValueType>);
                }
            }
        });
    globalUndoRouter.captureManual(applyDelete, {
        type: "manual",
        label: `Delete Table "${String(metadata.name ?? tableId)}"`,
        undo: applyRestore,
        redo: applyDelete,
    });
    return true;
}
