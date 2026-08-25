import { PGlite } from "@electric-sql/pglite";
import type { Hocuspocus } from "@hocuspocus/server";
import crypto from "crypto";
import * as Y from "yjs";
import { validateReadOnlySelect } from "../../../shared/src/services/readOnlySql.js";
import { type Item, Project } from "../schema/app-schema.js";
import { McpReadError } from "./outliner-read-service.js";

export type RelationValue = string | number | boolean | null;
export type RelationWrite =
    | { op: "UPDATE"; rowId: string; column: string; value: RelationValue; }
    | { op: "INSERT"; values: Record<string, RelationValue>; destination?: { parentKey: string; }; }
    | { op: "DELETE"; rowId: string; disposition?: "delete-source" | "clear-projected-field"; };

const SYSTEM_SCHEMA = `CREATE TABLE outline_items (
 id TEXT PRIMARY KEY, page_id TEXT, parent_id TEXT, text TEXT, due TIMESTAMPTZ,
 done BOOLEAN, tags TEXT, all_day BOOLEAN, start_on DATE, start_at TIMESTAMPTZ,
 duration INTERVAL, rrule TEXT, recurrence_dtstart TEXT, recurrence_timezone TEXT,
 recurrence_parent_id TEXT, recurrence_occurrence_id TEXT)`;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const mcpDb = new PGlite();
let dbTail = Promise.resolve();

async function acquireDb(): Promise<{ db: PGlite; release: () => void; }> {
    const previous = dbTail;
    let release = () => {};
    dbTail = new Promise<void>(resolve => release = resolve);
    await previous;
    const tables = await mcpDb.query<{ tablename: string; }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    for (const { tablename } of tables.rows) {
        await mcpDb.exec(`DROP TABLE IF EXISTS "${tablename.replace(/"/g, '""')}" CASCADE`);
    }
    return { db: mcpDb, release };
}

interface TableEntry {
    relation: string;
    kind: "table";
    tableId: string;
    displayName: string;
}
interface TableDoc {
    schema: string;
    data: Y.Map<Y.Map<RelationValue>>;
    disconnect(): Promise<void> | void;
}

export class OutlinerRelationService {
    constructor(
        private readonly hocuspocus: Pick<Hocuspocus, "openDirectConnection">,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
    ) {}

    private async withProject<T>(uid: string, projectId: string, fn: (doc: Y.Doc) => Promise<T> | T): Promise<T> {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(projectId)) throw new McpReadError("invalid_argument", "Invalid project ID");
        if (!await this.canAccess(uid, projectId)) throw new McpReadError("forbidden", "Project is inaccessible");
        const connection = await this.hocuspocus.openDirectConnection(`projects/${projectId}`, { context: { uid } });
        try {
            return await fn(connection.document as unknown as Y.Doc);
        } finally {
            await connection.disconnect();
        }
    }

    private tables(doc: Y.Doc): TableEntry[] {
        const result: TableEntry[] = [];
        doc.getMap<Y.Map<unknown>>("yjsTables").forEach((entry, tableId) => {
            const relation = String(entry.get("sqlName") ?? "");
            if (IDENT.test(relation)) {
                result.push({
                    relation,
                    kind: "table",
                    tableId,
                    displayName: String(entry.get("name") ?? ""),
                });
            }
        });
        return result;
    }

    private async openTable(uid: string, projectId: string, tableId: string): Promise<TableDoc> {
        const connection = await this.hocuspocus.openDirectConnection(
            `projects/${projectId}/tables/${tableId}`,
            { context: { uid } },
        );
        const doc = connection.document as unknown as Y.Doc;
        return {
            schema: doc.getText("schema").toString(),
            data: doc.getMap("data"),
            disconnect: connection.disconnect,
        };
    }

    listRelations(uid: string, projectId: string) {
        return this.withProject(uid, projectId, doc => ({
            relations: [...this.tables(doc), { relation: "outline_items", kind: "system" as const }],
        }));
    }

    getRelationSchema(uid: string, projectId: string, relation: string) {
        return this.withProject(uid, projectId, async doc => {
            const table = this.tables(doc).find(value => value.relation === relation);
            if (!table && relation !== "outline_items") throw new McpReadError("not_found", "Relation not found");
            const lease = await acquireDb();
            const db = lease.db;
            let opened: TableDoc | undefined;
            try {
                const schema = table
                    ? (opened = await this.openTable(uid, projectId, table.tableId)).schema
                    : SYSTEM_SCHEMA;
                await db.exec(schema);
                const rows = await db.query<{ column_name: string; data_type: string; is_nullable: string; }>(
                    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
                     WHERE table_name = $1 ORDER BY ordinal_position`,
                    [relation],
                );
                return {
                    relation,
                    kind: table ? "table" : "system",
                    ...(table ? { tableId: table.tableId, displayName: table.displayName } : {}),
                    columns: rows.rows.map(row => ({
                        name: row.column_name,
                        type: row.data_type,
                        nullable: row.is_nullable === "YES",
                    })),
                    capabilities: {
                        select: true,
                        update: true,
                        insert: { allowed: true, requiresDestination: !table },
                        delete: { allowed: true, requiresDisposition: !table },
                    },
                };
            } catch (error) {
                throw this.sqlError(error);
            } finally {
                await opened?.disconnect();
                lease.release();
            }
        });
    }

    async querySql(uid: string, projectId: string, sql: string, maxRows = 100) {
        if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 1000) {
            throw new McpReadError("invalid_argument", "maxRows must be an integer from 1 to 1000");
        }
        let select: string;
        try {
            select = validateReadOnlySelect(sql);
        } catch (error) {
            throw new McpReadError("invalid_argument", error instanceof Error ? error.message : String(error));
        }
        return await this.withProject(uid, projectId, async doc => {
            const lease = await acquireDb();
            const db = lease.db;
            const opened: TableDoc[] = [];
            try {
                await db.exec(SYSTEM_SCHEMA);
                await this.loadOutlineItems(db, Project.fromDoc(doc));
                for (const table of this.tables(doc)) {
                    const source = await this.openTable(uid, projectId, table.tableId);
                    opened.push(source);
                    if (!source.schema.trim()) continue;
                    await db.exec(source.schema);
                    await this.loadRecords(db, table.relation, source.data);
                }
                const result = await db.query<Record<string, unknown>>(select);
                const rows = result.rows.slice(0, maxRows);
                return {
                    columns: (result.fields ?? []).map(field => ({ name: field.name, type: String(field.dataTypeID) })),
                    rows,
                    rowCount: rows.length,
                    truncated: result.rows.length > maxRows,
                };
            } catch (error) {
                throw this.sqlError(error);
            } finally {
                for (const source of opened) await source.disconnect();
                lease.release();
            }
        });
    }

    writeRelation(uid: string, projectId: string, relation: string, write: RelationWrite) {
        return this.withProject(uid, projectId, async doc => {
            const table = this.tables(doc).find(value => value.relation === relation);
            if (!table && relation !== "outline_items") throw new McpReadError("not_found", "Relation not found");
            if (!table) return this.writeOutline(Project.fromDoc(doc), write);
            const source = await this.openTable(uid, projectId, table.tableId);
            try {
                let rowId = "rowId" in write ? write.rowId : String(write.values.id ?? crypto.randomUUID());
                source.data.doc?.transact(() => {
                    if (write.op === "INSERT") {
                        if (source.data.has(rowId)) throw new Error(`Record "${rowId}" already exists`);
                        const record = new Y.Map<RelationValue>();
                        for (const [key, value] of Object.entries({ ...write.values, id: rowId })) {
                            record.set(key, value);
                        }
                        source.data.set(rowId, record);
                    } else if (write.op === "UPDATE") {
                        const record = source.data.get(rowId);
                        if (!record) throw new Error(`Record "${rowId}" does not exist`);
                        record.set(write.column, write.value);
                    } else {
                        if (!source.data.has(rowId)) throw new Error(`Record "${rowId}" does not exist`);
                        source.data.delete(rowId);
                    }
                }, "mcp-relation-write");
                return { relation, op: write.op, rowId };
            } catch (error) {
                throw new McpReadError("invalid_argument", error instanceof Error ? error.message : String(error));
            } finally {
                await source.disconnect();
            }
        });
    }

    setViewQuery(uid: string, projectId: string, kind: "grid" | "calendar", viewId: string, query: string) {
        try {
            validateReadOnlySelect(query);
        } catch (error) {
            throw new McpReadError("invalid_argument", error instanceof Error ? error.message : String(error));
        }
        return this.withProject(uid, projectId, doc => {
            const registry = doc.getMap<Y.Map<unknown>>(kind === "grid" ? "yjsGrids" : "calendars");
            const view = registry.get(viewId);
            if (!view) throw new McpReadError("not_found", `${kind === "grid" ? "Grid" : "Calendar"} not found`);
            doc.transact(() => view.set("query", query), "mcp-view-query");
            return { kind, viewId, query };
        });
    }

    private async loadRecords(db: PGlite, relation: string, data: Y.Map<Y.Map<RelationValue>>) {
        for (const [id, record] of data) {
            const values: Record<string, unknown> = { ...Object.fromEntries(record.entries()), id };
            const keys = Object.keys(values).filter(key => IDENT.test(key));
            if (!keys.length) continue;
            await db.query(
                `INSERT INTO "${relation}" (${keys.map(key => `"${key}"`).join(",")}) VALUES (${
                    keys.map((_, index) => `$${index + 1}`).join(",")
                })`,
                keys.map(key => values[key]),
            );
        }
    }

    private allItems(project: Project): Item[] {
        const result: Item[] = [];
        const visit = (items: Iterable<Item>) => {
            for (const item of items) {
                result.push(item);
                visit(item.items);
            }
        };
        visit(project.items);
        return result;
    }

    private async loadOutlineItems(db: PGlite, project: Project) {
        for (const item of this.allItems(project)) {
            const value = item.yMap;
            const due = value.get("due");
            const start = value.get("start");
            const rrule = value.get("rrule");
            if (!due && !start && !rrule) continue;
            await db.query(
                `INSERT INTO outline_items (id,text,due,done,all_day,start_on,start_at,rrule) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    item.key,
                    item.text,
                    due,
                    Boolean(value.get("done")),
                    value.get("allDay"),
                    value.get("allDay") ? start : null,
                    value.get("allDay") ? null : start,
                    rrule,
                ],
            );
        }
    }

    private writeOutline(project: Project, write: RelationWrite) {
        if (write.op === "INSERT" && !write.destination) {
            throw new McpReadError("invalid_argument", "INSERT into outline_items requires an explicit destination");
        }
        if (write.op === "DELETE" && !write.disposition) {
            throw new McpReadError("invalid_argument", "DELETE from outline_items requires an explicit disposition");
        }
        const items = this.allItems(project);
        if (write.op === "INSERT") {
            this.assertItemColumns(write.values);
            const parent = items.find(item => item.key === write.destination!.parentKey);
            if (!parent) throw new McpReadError("invalid_argument", "INSERT destination does not exist");
            const created = parent.items.addNode("mcp-relation-write");
            this.setItemValues(created, write.values);
            return { relation: "outline_items", op: write.op, rowId: created.key };
        }
        const item = items.find(candidate => candidate.key === write.rowId);
        if (!item) throw new McpReadError("invalid_argument", `Item "${write.rowId}" does not exist`);
        if (write.op === "UPDATE") {
            this.assertItemColumns({ [write.column]: write.value });
            this.setItemValues(item, { [write.column]: write.value });
        } else if (write.disposition === "delete-source") item.delete();
        else {for (const field of ["due", "start", "allDay", "rrule", "recurrenceDtstart", "recurrenceTimezone"]) {
                item.yMap.delete(field);
            }}
        return { relation: "outline_items", op: write.op, rowId: item.key };
    }

    private setItemValues(item: Item, values: Record<string, RelationValue>) {
        const fields: Record<string, string> = { due: "due", done: "done", all_day: "allDay", rrule: "rrule" };
        for (const [column, value] of Object.entries(values)) {
            if (column === "text") item.text = value == null ? "" : String(value);
            else if (fields[column]) {
                value == null
                    ? item.yMap.delete(fields[column])
                    : item.yMap.set(fields[column], value);
            } else if (column !== "id") {
                throw new McpReadError("invalid_argument", `Column "${column}" is not writable`);
            }
        }
    }

    private assertItemColumns(values: Record<string, RelationValue>) {
        const writable = new Set(["id", "text", "due", "done", "all_day", "rrule"]);
        const invalid = Object.keys(values).find(column => !writable.has(column));
        if (invalid) throw new McpReadError("invalid_argument", `Column "${invalid}" is not writable`);
    }

    private sqlError(error: unknown): McpReadError {
        if (error instanceof McpReadError) return error;
        const sqlMessage = error instanceof Error ? error.message : String(error);
        return new McpReadError("invalid_argument", `SQL query failed: ${sqlMessage}`, {
            stage: "sql_execution",
            sqlMessage,
        });
    }
}
