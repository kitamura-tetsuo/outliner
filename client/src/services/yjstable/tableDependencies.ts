// What else in a project would notice if a Table disappeared.
//
// Everything here is a *reference*, never a child: Grids name a Table through
// `sourceTableId`, Schedules name it as a write target or inside their SQL,
// outline items name a Grid that names the Table. A Table owns its schema and
// its data and nothing else (issue #5012), so this module answers "used by",
// not "contains".

import * as Y from "yjs";
import { type Item, Project } from "../../../../shared/src/app-schema";
import { findSchedulesReferencingTable } from "../schedule/scheduleRuleService";
import { destroyGridUndoManager, findGridsBySourceTable, getGridHandles, getGridRegistry, listGrids } from "./gridDocs";
import { parseIdentifiers } from "./queryAnalysis";
import { destroyTableUndoManager, getTableRegistry, listTables } from "./tableDocs";

export interface TableDependencies {
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
        type: "query" | "calendar" | "schedule";
        name: string;
    }[];
    /** Grids in the project registry that name this Table as their source. */
    dependentGridIds: string[];
}

export function getTableDependencies(project: Project, tableId: string): TableDependencies {
    const scheduleReferences = findSchedulesReferencingTable(project, tableId);
    const dependencies: TableDependencies = {
        directGridReferences: [],
        scheduledTargets: scheduleReferences
            .filter(r => r.kind === "write-target")
            .map(({ ruleId, ruleName }) => ({ ruleId, ruleName })),
        scheduleReferences: scheduleReferences.map(({ ruleId, ruleName, kind }) => ({ ruleId, ruleName, kind })),
        indirectSqlReferences: [],
        dependentGridIds: findGridsBySourceTable(project.ydoc, tableId).map(g => g.gridId),
    };

    const targetSqlName = listTables(project.ydoc).find(t => t.tableId === tableId)?.sqlName;
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

    // 3. Indirect SQL References — Grids whose SELECT (via any source Table)
    // references the target Table by SQL name.
    if (targetSqlName) {
        for (const g of listGrids(project.ydoc)) {
            if (gridsOfTable.has(g.gridId)) continue;
            const gridHandles = getGridHandles(project.ydoc, g.gridId);
            if (!gridHandles) continue;
            const query = String(gridHandles.entry.get("query") ?? "");
            if (!query) continue;
            const identifiers = parseIdentifiers(query);
            if (identifiers.has(targetSqlName.toLowerCase()) || identifiers.has(targetSqlName)) {
                dependencies.indirectSqlReferences.push({
                    type: "query",
                    name: g.name || "Untitled Grid",
                });
            }
        }

        // Calendars
        if (project.calendars) {
            project.calendars.forEach((calMap, _calId) => {
                const query = calMap.get("query") as string | undefined;
                if (query) {
                    const identifiers = parseIdentifiers(query);
                    if (identifiers.has(targetSqlName.toLowerCase()) || identifiers.has(targetSqlName)) {
                        dependencies.indirectSqlReferences.push({
                            type: "calendar",
                            name: calMap.get("name") as string || "Untitled Calendar",
                        });
                    }
                }
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
    const gridRegistry = getGridRegistry(project.ydoc);

    let detachedGridCount = 0;
    let deletedGridCount = 0;
    let deletedScheduleCount = 0;

    project.ydoc.transact(() => {
        if (policy === "remove-direct-references") {
            // Remove direct Grid references from outline items
            for (const ref of deps.directGridReferences) {
                try {
                    const nodeValue = project.tree.getNodeValueFromKey(ref.itemKey) as Y.Map<unknown> | undefined;
                    if (nodeValue) {
                        nodeValue.set("componentType", undefined);
                        nodeValue.set("yjsGridId", undefined);
                        detachedGridCount++;
                    }
                } catch (_e) {
                    // Node might be deleted concurrently
                }
            }

            // Remove Grid registry entries whose source Table is being deleted.
            // A Grid without a source cannot render usefully, so cleaning them
            // up now is what "remove references" means for the Grid layer.
            for (const dependentGridId of deps.dependentGridIds) {
                const gridEntry = gridRegistry.get(dependentGridId);
                if (gridEntry) {
                    destroyGridUndoManager(gridEntry);
                    gridRegistry.delete(dependentGridId);
                    deletedGridCount++;
                }
            }

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
