// Yjs data model for the consolidated table feature.
//
// One Table = one Y.Doc subdoc inside the project doc. The project doc keeps
// a registry map (tableId -> Y.Map with the display name and the subdoc
// reference) so Tables can be listed without loading their contents.
//
// Each Table subdoc holds exactly TWO structures — Table is the relational
// data entity, not a presentation one:
//   1. Schema Definition: Y.Text "schema" with a single CREATE TABLE statement.
//   2. Data Storage:      Y.Map  "data": recordId (UUID) -> nested Y.Map
//                         (column name -> value) for field-level CRDT merges.
//
// SELECT/query text and per-column UI settings (labels, hidden, cell components,
// column order) are Grid state and live in a project-level Grid registry (see
// `gridDocs.ts`). One Table can be referenced by many Grids. This separation
// is what lets several independent Grids share the same schema/data without
// cloning the Table.

import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";

export const ADAPTER_ORIGIN = Symbol("adapter-origin");
export const TABLE_REGISTRY_KEY = "yjsTables";
export const TABLE_SCHEMA_KEY = "schema";
export const TABLE_DATA_KEY = "data";

export type TableRecordValue = string | number | boolean | null;
export type TableRecord = Y.Map<TableRecordValue>;
export type TableData = Y.Map<TableRecord>;

export interface TableRegistryEntry {
    sourceProjectId?: string;
    sourceTableId?: string;
    tableId: string;
    /** Free-text label. Never appears in SQL. */
    name: string;
    /**
     * The identifier of the table's `CREATE TABLE` statement, denormalized
     * into the project doc so conflicts can be detected and `FROM <name>`
     * resolved to a table id without loading every subdoc. The schema text is
     * authoritative: this field is rewritten whenever a schema is applied.
     */
    sqlName: string;
}

export interface TableHandles {
    tableId: string;
    doc: Y.Doc;
    schemaText: Y.Text;
    data: TableData;
    /** Undo scope spans this Table's schema and data (Grid state is undone separately). */
    undo: Y.UndoManager;
    /**
     * @deprecated Legacy handle exposing the Table subdoc's old "ui" map. New
     * code MUST NOT store presentation state here — SELECT text, column order,
     * labels, and cell component settings all live on Grid entries (see
     * `gridDocs.ts`). Retained only so pre-split tests and clipboard fixtures
     * keep compiling while call sites migrate; the field is scheduled to be
     * removed once every reference is on the Grid API.
     */
    uiDef: Y.Map<unknown>;
}

/** Structure handles available while a table is still invisible to the project registry. */
export type TableInitializationHandles = Omit<TableHandles, "undo">;

const tableUndoManagers = new WeakMap<Y.Doc, Y.UndoManager>();

/** The registry map in the project doc: tableId -> Y.Map entry. */
export function getTableRegistry(projectDoc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return projectDoc.getMap<Y.Map<unknown>>(TABLE_REGISTRY_KEY);
}

export function listTables(projectDoc: Y.Doc): TableRegistryEntry[] {
    const registry = getTableRegistry(projectDoc);
    const entries: TableRegistryEntry[] = [];
    registry.forEach((entry, tableId) => {
        entries.push({
            tableId,
            name: String(entry.get("name") ?? ""),
            sourceProjectId: entry.get("sourceProjectId") ? String(entry.get("sourceProjectId")) : undefined,
            sourceTableId: entry.get("sourceTableId") ? String(entry.get("sourceTableId")) : undefined,
            sqlName: String(entry.get("sqlName") ?? ""),
        });
    });
    return entries;
}

/**
 * Create a new table: a fresh subdoc referenced from the project registry.
 * Optional initialization runs on the standalone subdoc before the registry can
 * expose it, so observers never see a partially populated table. An initializer
 * failure leaves no registry entry or attached project subdocument.
 * Returns the new table id.
 */
export function createTable(
    projectDoc: Y.Doc,
    name: string,
    sqlName: string,
    options?:
        | { sourceProjectId?: string; sourceTableId?: string; tableId?: string; }
        | ((handles: TableInitializationHandles) => void),
    initialize?: (handles: TableInitializationHandles) => void,
): string {
    const tableId = typeof options === "object" && options.tableId ? options.tableId : uuidv4();
    const subdoc = new Y.Doc({ guid: tableDocGuid(projectDoc.guid, tableId), autoLoad: true });
    const handles: TableInitializationHandles = {
        tableId,
        doc: subdoc,
        schemaText: subdoc.getText(TABLE_SCHEMA_KEY),
        data: subdoc.getMap<TableRecord>(TABLE_DATA_KEY),
        uiDef: subdoc.getMap<unknown>("ui"),
    };
    try {
        subdoc.transact(() => {
            if (typeof options === "function") options(handles);
            else if (initialize) initialize(handles);
        });
    } catch (err) {
        subdoc.destroy();
        throw err;
    }

    projectDoc.transact(() => {
        const entry = new Y.Map<unknown>();
        entry.set("name", name);
        entry.set("sqlName", sqlName);
        if (options && typeof options !== "function") {
            if (options.sourceProjectId) entry.set("sourceProjectId", options.sourceProjectId);
            if (options.sourceTableId) entry.set("sourceTableId", options.sourceTableId);
        }
        entry.set("doc", subdoc);
        getTableRegistry(projectDoc).set(tableId, entry);
    });
    return tableId;
}

export function removeTable(projectDoc: Y.Doc, tableId: string): boolean {
    const registry = getTableRegistry(projectDoc);
    const entry = registry.get(tableId);
    if (!entry) return false;
    const doc = entry.get("doc");
    projectDoc.transact(() => registry.delete(tableId));
    if (doc instanceof Y.Doc) {
        destroyTableUndoManager(doc);
        doc.destroy();
    }
    return true;
}

export function renameTable(projectDoc: Y.Doc, tableId: string, name: string): void {
    const entry = getTableRegistry(projectDoc).get(tableId);
    entry?.set("name", name);
}

export function getTableName(projectDoc: Y.Doc, tableId: string): string | undefined {
    const entry = getTableRegistry(projectDoc).get(tableId);
    return entry ? String(entry.get("name") ?? "") : undefined;
}

export function getTableSqlName(projectDoc: Y.Doc, tableId: string): string | undefined {
    const entry = getTableRegistry(projectDoc).get(tableId);
    const sqlName = entry ? String(entry.get("sqlName") ?? "") : "";
    return sqlName || undefined;
}

/**
 * Record the identifier of the applied `CREATE TABLE` statement. Called only
 * by the sync adapter after a schema has been validated and applied.
 */
export function setTableSqlName(projectDoc: Y.Doc, tableId: string, sqlName: string): void {
    const entry = getTableRegistry(projectDoc).get(tableId);
    if (entry && entry.get("sqlName") !== sqlName) entry.set("sqlName", sqlName);
}

/** Resolve a relation name used in a query to the table that owns it. */
export function findTableIdBySqlName(projectDoc: Y.Doc, sqlName: string): string | undefined {
    return listTables(projectDoc).find((entry) => entry.sqlName === sqlName)?.tableId;
}

/**
 * Check whether `sqlName` is already used by a different table of the project.
 * Returns a message naming the conflicting table, or undefined when free.
 */
export function findSqlNameConflict(
    projectDoc: Y.Doc,
    tableId: string,
    sqlName: string,
): string | undefined {
    const conflict = listTables(projectDoc).find(
        (entry) => entry.tableId !== tableId && entry.sqlName === sqlName,
    );
    if (!conflict) return undefined;
    return `Table name "${sqlName}" is already used by "${conflict.name || conflict.tableId}" `
        + "in this project. Table names must be unique so queries can reference them.";
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
    if (!doc || typeof doc !== "object" || !("load" in doc)) return undefined;
    const ydoc = doc as Y.Doc;
    ydoc.load();
    const schemaText = ydoc.getText(TABLE_SCHEMA_KEY);
    const data = ydoc.getMap<TableRecord>(TABLE_DATA_KEY);
    const uiDef = ydoc.getMap<unknown>("ui");

    let undo = tableUndoManagers.get(ydoc);
    if (!undo) {
        undo = new Y.UndoManager([schemaText, data], {
            trackedOrigins: new Set([null, ADAPTER_ORIGIN]),
        });
        tableUndoManagers.set(ydoc, undo);
        globalUndoRouter.register(undo);
    }

    return { tableId, doc: ydoc, schemaText, data, undo, uiDef };
}

export function destroyTableUndoManager(doc: Y.Doc): void {
    const undo = tableUndoManagers.get(doc);
    if (undo) {
        globalUndoRouter.unregister(undo);
        undo.destroy();
        tableUndoManagers.delete(doc);
    }
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
