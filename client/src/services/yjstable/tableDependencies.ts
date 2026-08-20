import * as Y from "yjs";
import { type Item, Project } from "../../../../shared/src/app-schema";
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
    scheduledTargets: {
        ruleId: string;
        ruleName: string;
    }[];
    indirectSqlReferences: {
        type: "query" | "calendar" | "schedule";
        name: string;
    }[];
    /** Grids in the project registry that name this Table as their source. */
    dependentGridIds: string[];
}

export function getTableDependencies(project: Project, tableId: string): TableDependencies {
    const dependencies: TableDependencies = {
        directGridReferences: [],
        scheduledTargets: [],
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

    // 2. Scheduled Targets
    if (project.schedules) {
        project.schedules.forEach((ruleMap, ruleId) => {
            if (ruleMap.get("targetTableId") === tableId) {
                dependencies.scheduledTargets.push({
                    ruleId,
                    ruleName: ruleMap.get("name") as string || "Untitled Schedule",
                });
            }

            // Indirect SQL dependencies in schedules
            if (targetSqlName) {
                const sql = ruleMap.get("query") as string | undefined;
                if (sql) {
                    const identifiers = parseIdentifiers(sql);
                    if (identifiers.has(targetSqlName.toLowerCase()) || identifiers.has(targetSqlName)) {
                        dependencies.indirectSqlReferences.push({
                            type: "schedule",
                            name: ruleMap.get("name") as string || "Untitled Schedule",
                        });
                    }
                }
            }
        });
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
