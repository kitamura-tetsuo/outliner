import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { createGrid, getGridHandles, getGridRegistry, listGrids } from "./gridDocs";
import { deriveSqlName } from "./sqlNames";
import { createTable, getTableHandles, listTables, removeTable, type TableRecordValue } from "./tableDocs";
import { rewriteCreateTableSql } from "./tableSqlRewrite";

export type DuplicableObject = { type: "grid" | "table"; id: string; };
export type DuplicationScope = "item-only" | "referenced" | "referencing" | "connected";

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
    const tables = new Set(listTables(source).map(table => table.tableId));
    const byTable = new Map<string, string[]>();
    for (const grid of grids) {
        const ids = byTable.get(grid.sourceTableId) ?? [];
        ids.push(grid.gridId);
        byTable.set(grid.sourceTableId, ids);
    }

    const visited = new Map<string, DuplicableObject>();
    const queue = [primary];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(key(current))) continue;
        visited.set(key(current), current);

        if ((scope === "referenced" || scope === "connected") && current.type === "grid") {
            const tableId = grids.find(grid => grid.gridId === current.id)?.sourceTableId;
            if (tableId && tables.has(tableId)) queue.push({ type: "table", id: tableId });
        }
        if ((scope === "referencing" || scope === "connected") && current.type === "table") {
            for (const gridId of byTable.get(current.id) ?? []) queue.push({ type: "grid", id: gridId });
        }
    }

    let omittedReferenceCount = 0;
    for (const object of visited.values()) {
        if (object.type !== "grid") continue;
        const tableId = grids.find(grid => grid.gridId === object.id)?.sourceTableId;
        if (tableId && !visited.has(key({ type: "table", id: tableId }))) omittedReferenceCount++;
    }
    return { objects: [...visited.values()], omittedReferenceCount };
}

/**
 * Materialize a previously previewed graph. IDs are allocated up front and
 * references are rewritten only against that map. On failure all registry
 * entries made by this invocation are removed, so observers never retain a
 * partially copied graph.
 */
export function duplicateObjects(
    source: Y.Doc,
    destination: Y.Doc,
    primary: DuplicableObject,
    scope: DuplicationScope,
    options: { copyTableData?: boolean; } = {},
): DuplicationResult {
    const preview = previewObjectDuplication(source, primary, scope);
    const idMap = new Map<string, string>();
    for (const object of preview.objects) idMap.set(key(object), uuidv4());

    const sameProject = source === destination;
    const createdTables: string[] = [];
    const createdGrids: string[] = [];
    const tableNames = new Set(listTables(destination).map(table => table.name));
    const gridNames = new Set(listGrids(destination).map(grid => grid.name));
    const sqlNames = new Set(listTables(destination).map(table => table.sqlName));
    let removedReferenceCount = 0;

    try {
        // Tables precede Grids, but both kinds already have destination IDs.
        for (const object of preview.objects.filter(object => object.type === "table")) {
            const sourceEntry = listTables(source).find(table => table.tableId === object.id);
            const sourceHandles = getTableHandles(source, object.id);
            if (!sourceEntry || !sourceHandles) throw new Error(`Table "${object.id}" no longer exists`);
            const destinationId = idMap.get(key(object))!;
            const destinationSqlName = deriveSqlName(sourceEntry.sqlName, sqlNames);
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
            createGrid(destination, targetTableId, {
                gridId: destinationId,
                name: allocateCopyName(sourceGrid.name, gridNames),
                query: String(handles.entry.get("query") ?? ""),
                columnOrder: Array.isArray(handles.entry.get("columnOrder"))
                    ? [...handles.entry.get("columnOrder") as string[]]
                    : undefined,
                components,
            });
            createdGrids.push(destinationId);
        }
    } catch (error) {
        destination.transact(() => {
            for (const gridId of createdGrids) getGridRegistry(destination).delete(gridId);
            for (const tableId of createdTables) removeTable(destination, tableId);
        });
        throw error;
    }

    return { idMap, primaryId: idMap.get(key(primary))!, removedReferenceCount };
}
