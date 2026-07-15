// Yjs data model for the consolidated table feature.
//
// One table = one Y.Doc subdoc inside the project doc. The project doc keeps
// a registry map (tableId -> Y.Map with the display name and the subdoc
// reference) so tables can be listed without loading their contents.
//
// Each table subdoc holds exactly three structures:
//   1. Schema Definition: Y.Text "schema" with a single CREATE TABLE statement.
//   2. UI Definition:     Y.Map  "ui" with the query string and nested
//                         Y.Map component settings per column.
//   3. Data Storage:      Y.Map  "data": recordId (UUID) -> nested Y.Map
//                         (column name -> value) for field-level CRDT merges.

import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";

export const TABLE_REGISTRY_KEY = "yjsTables";
export const TABLE_SCHEMA_KEY = "schema";
export const TABLE_UI_KEY = "ui";
export const TABLE_DATA_KEY = "data";

export type TableRecordValue = string | number | boolean | null;
export type TableRecord = Y.Map<TableRecordValue>;
export type TableData = Y.Map<TableRecord>;

export interface TableRegistryEntry {
    tableId: string;
    name: string;
}

export interface TableHandles {
    tableId: string;
    doc: Y.Doc;
    schemaText: Y.Text;
    uiDef: Y.Map<unknown>;
    data: TableData;
    /** Undo scope spans all three structures of the table. */
    undo: Y.UndoManager;
}

/** The registry map in the project doc: tableId -> Y.Map entry. */
export function getTableRegistry(projectDoc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return projectDoc.getMap<Y.Map<unknown>>(TABLE_REGISTRY_KEY);
}

export function listTables(projectDoc: Y.Doc): TableRegistryEntry[] {
    const registry = getTableRegistry(projectDoc);
    const entries: TableRegistryEntry[] = [];
    registry.forEach((entry, tableId) => {
        entries.push({ tableId, name: String(entry.get("name") ?? "") });
    });
    return entries;
}

/**
 * Create a new table: a fresh subdoc referenced from the project registry.
 * Returns the new table id.
 */
export function createTable(projectDoc: Y.Doc, name: string): string {
    const tableId = uuidv4();
    const subdoc = new Y.Doc({ guid: tableDocGuid(projectDoc.guid, tableId), autoLoad: true });
    projectDoc.transact(() => {
        const entry = new Y.Map<unknown>();
        entry.set("name", name);
        entry.set("doc", subdoc);
        getTableRegistry(projectDoc).set(tableId, entry);
    });
    return tableId;
}

export function renameTable(projectDoc: Y.Doc, tableId: string, name: string): void {
    const entry = getTableRegistry(projectDoc).get(tableId);
    entry?.set("name", name);
}

export function getTableName(projectDoc: Y.Doc, tableId: string): string | undefined {
    const entry = getTableRegistry(projectDoc).get(tableId);
    return entry ? String(entry.get("name") ?? "") : undefined;
}

/** Deterministic subdoc guid so every client resolves the same table room. */
export function tableDocGuid(projectGuid: string, tableId: string): string {
    return `${projectGuid}--table--${tableId}`;
}

/**
 * Resolve the subdoc of a table and wrap its three structures. Returns
 * undefined when the table is not registered. Loading (network/persistence
 * attachment) is the caller's responsibility — see tableDocConnection.
 */
export function getTableHandles(projectDoc: Y.Doc, tableId: string): TableHandles | undefined {
    const entry = getTableRegistry(projectDoc).get(tableId);
    const doc = entry?.get("doc");
    if (!(doc instanceof Y.Doc)) return undefined;
    doc.load();
    const schemaText = doc.getText(TABLE_SCHEMA_KEY);
    const uiDef = doc.getMap<unknown>(TABLE_UI_KEY);
    const data = doc.getMap<TableRecord>(TABLE_DATA_KEY);
    const undo = new Y.UndoManager([schemaText, uiDef, data]);
    return { tableId, doc, schemaText, uiDef, data, undo };
}

/** Replace the schema text with a new statement in a single transaction. */
export function setSchemaText(handles: TableHandles, sql: string, origin?: unknown): void {
    handles.doc.transact(() => {
        handles.schemaText.delete(0, handles.schemaText.length);
        handles.schemaText.insert(0, sql);
    }, origin);
}

/** Add a record to Data Storage. Values are stored per column (nested Y.Map). */
export function addRecord(
    handles: TableHandles,
    values: Record<string, TableRecordValue>,
    recordId: string = uuidv4(),
): string {
    handles.doc.transact(() => {
        const record = new Y.Map<TableRecordValue>();
        for (const [column, value] of Object.entries(values)) {
            record.set(column, value);
        }
        record.set("id", recordId);
        handles.data.set(recordId, record);
    });
    return recordId;
}

/** Set a single field of a record. No-op when the record does not exist. */
export function setRecordValue(
    handles: TableHandles,
    recordId: string,
    column: string,
    value: TableRecordValue,
): void {
    handles.data.get(recordId)?.set(column, value);
}

export function deleteRecord(handles: TableHandles, recordId: string): void {
    handles.data.delete(recordId);
}

/**
 * Remove the data stored under the given columns from every record.
 * Used after a schema change dropped columns (with user confirmation).
 */
export function deleteColumnData(handles: TableHandles, columns: string[], origin?: unknown): void {
    if (columns.length === 0) return;
    handles.doc.transact(() => {
        handles.data.forEach((record) => {
            for (const column of columns) {
                if (record.has(column)) record.delete(column);
            }
        });
    }, origin);
}
