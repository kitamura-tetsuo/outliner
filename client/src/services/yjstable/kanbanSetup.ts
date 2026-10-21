import { getKanbanRegistry, type KanbanDefinitionSeed, prepareKanbanEntry } from "$shared/services/kanbanDefinition";
import { KANBAN_COMPONENT_TYPE } from "$shared/services/outlineNodeKind";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import type { KanbanPlacementItem } from "./kanbanBinding";
import { sqlNameError } from "./sqlNames";
import { getTableRegistry, listTables, prepareTable } from "./tableDocs";
import type { TablePreset } from "./tablePresets";

export type KanbanSetupItem = KanbanPlacementItem & { ydoc: Y.Doc; };
export type KanbanSetupAuthorization = () => { projectAccess: boolean; surfaceWritable: boolean; };

function destination(item: KanbanSetupItem, authorize: KanbanSetupAuthorization): Y.Map<unknown> {
    const auth = authorize();
    if (!auth.projectAccess) throw new Error("Project access is unavailable.");
    if (!auth.surfaceWritable) throw new Error("The destination is read-only.");
    const node = item.tree.getNodeValueFromKey(item.key);
    if (!(node instanceof Y.Map) || node.doc !== item.ydoc || node.get("componentType") !== KANBAN_COMPONENT_TYPE) {
        throw new Error("The Kanban placement no longer exists.");
    }
    if (node.has("kanbanId")) throw new Error("The Kanban placement has already been bound.");
    return node;
}

function availableName(doc: Y.Doc, sqlName: string): void {
    const invalid = sqlNameError(sqlName);
    if (invalid) throw new Error(invalid);
    if (listTables(doc).some(table => table.sqlName === sqlName)) {
        throw new Error(`SQL name "${sqlName}" is already used in this project`);
    }
}

function publish(
    item: KanbanSetupItem,
    authorize: KanbanSetupAuthorization,
    seed: KanbanDefinitionSeed,
    table?: ReturnType<typeof prepareTable>,
): string {
    // All potentially failing initialization/validation precedes the writes.
    const entry = prepareKanbanEntry(seed);
    const id = uuidv4();
    const node = destination(item, authorize);
    const registry = getKanbanRegistry(item.ydoc);
    if (registry.has(id)) throw new Error("Kanban identity is already used.");
    item.ydoc.transact(() => {
        if (table) getTableRegistry(item.ydoc).set(table.tableId, table.entry);
        registry.set(id, entry);
        node.set("kanbanId", id);
    });
    return id;
}

export function createKanbanWithNewTable(
    item: KanbanSetupItem,
    input: { preset: TablePreset; name: string; sqlName: string; },
    authorize: KanbanSetupAuthorization,
): { kanbanId: string; tableId: string; } {
    const originalNode = destination(item, authorize);
    availableName(item.ydoc, input.sqlName);
    const query = input.preset.query(input.sqlName);
    const schema = input.preset.schemaSql(input.sqlName);
    const roles = input.preset.key === "tasks"
        ? { groupField: "status", titleField: "title" }
        : input.preset.key === "habits"
        ? { groupField: "kind", titleField: "name" }
        : { titleField: "title" };
    const seed = { name: input.name, query, ...roles };
    // Validate downstream settings before initializing or attaching a subdoc.
    prepareKanbanEntry(seed);
    const table = prepareTable(item.ydoc, input.name, input.sqlName, handles => handles.schemaText.insert(0, schema));
    try {
        if (destination(item, authorize) !== originalNode) throw new Error("The Kanban placement changed.");
        availableName(item.ydoc, input.sqlName);
        const kanbanId = publish(item, authorize, seed, table);
        return { kanbanId, tableId: table.tableId };
    } catch (error) {
        table.doc.destroy();
        throw error;
    }
}

export function createKanbanOverExistingTable(
    item: KanbanSetupItem,
    tableId: string,
    expectedSqlName: string | undefined,
    authorize: KanbanSetupAuthorization,
): string {
    destination(item, authorize);
    const table = listTables(item.ydoc).find(table => table.tableId === tableId);
    if (!table) throw new Error("The selected Table is no longer available.");
    if (table.sqlName !== expectedSqlName) throw new Error("The selected Table changed. Select it again.");
    const invalid = sqlNameError(table.sqlName);
    if (invalid) throw new Error(invalid);
    return publish(item, authorize, { name: table.name || "Kanban", query: `SELECT * FROM ${table.sqlName}` });
}

export function bindExistingKanban(item: KanbanSetupItem, id: string, authorize: KanbanSetupAuthorization): string {
    const node = destination(item, authorize);
    if (!getKanbanRegistry(item.ydoc).has(id)) throw new Error("The selected Kanban is no longer available.");
    node.set("kanbanId", id);
    return id;
}
