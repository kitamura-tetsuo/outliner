import { PGlite } from "@electric-sql/pglite";
import type { Hocuspocus } from "@hocuspocus/server";
import crypto from "crypto";
import * as Y from "yjs";
import { validateReadOnlySelect } from "../../../shared/src/services/readOnlySql.js";
import { type Item, Project } from "../schema/app-schema.js";
import {
    assertRevision,
    IdempotencyCache,
    type MutationPrecondition,
    outlineItemRevision,
    revisionOf,
} from "./mutation-contract.js";
import { McpReadError } from "./outliner-read-service.js";

const MAX_WRITE_PAYLOAD_BYTES = 32 * 1024;
const MAX_QUERY_BYTES = 16 * 1024;

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
    sourceProjectId?: string;
    sourceTableId?: string;
}
interface TableDoc {
    schema: string;
    data: Y.Map<Y.Map<RelationValue>>;
    disconnect(): Promise<void> | void;
}

export class OutlinerRelationService {
    private readonly idempotency = new IdempotencyCache();

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

    /**
     * Inspect one Table by its stable registry id. Record ids are sorted before
     * paging so Y.Map insertion order can never become an accidental row API.
     */
    getTable(
        uid: string,
        projectId: string,
        tableId: string,
        includeRecords = false,
        recordLimit = 25,
        cursor?: string,
    ) {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(tableId)) {
            throw new McpReadError("invalid_argument", "Invalid table ID");
        }
        if (!Number.isInteger(recordLimit) || recordLimit < 1 || recordLimit > 100) {
            throw new McpReadError("invalid_argument", "recordLimit must be an integer from 1 to 100");
        }
        return this.withProject(uid, projectId, async doc => {
            // Look up by registry id directly rather than through tables(),
            // which intentionally omits unapplied/invalid SQL names from the
            // query surface. Those are precisely the Tables this diagnostic
            // tool must still be able to inspect.
            const entry = doc.getMap<Y.Map<unknown>>("yjsTables").get(tableId);
            if (!entry) throw new McpReadError("not_found", "Table not found");
            const table: TableEntry = {
                tableId,
                kind: "table",
                displayName: String(entry.get("name") ?? ""),
                relation: String(entry.get("sqlName") ?? ""),
                ...(typeof entry.get("sourceProjectId") === "string"
                    ? { sourceProjectId: entry.get("sourceProjectId") as string }
                    : {}),
                ...(typeof entry.get("sourceTableId") === "string"
                    ? { sourceTableId: entry.get("sourceTableId") as string }
                    : {}),
            };
            const source = await this.openTable(uid, projectId, tableId);
            const lease = await acquireDb();
            try {
                const schema = await this.inspectTableSchema(lease.db, source.schema);
                const recordIds = [...source.data.keys()].sort((a, b) => a.localeCompare(b));
                const after = cursor === undefined ? undefined : this.decodeTableCursor(cursor);
                const start = after === undefined ? 0 : recordIds.findIndex(id => id > after);
                const pageStart = start < 0 ? recordIds.length : start;
                const pageIds = includeRecords ? recordIds.slice(pageStart, pageStart + recordLimit) : [];
                const records = pageIds.map(recordId => ({
                    recordId,
                    values: this.serializeRecord(source.data.get(recordId), schema.columns),
                    revision: this.rowRevision(source.data.get(recordId)),
                }));
                const recordErrors = includeRecords && schema.status === "valid"
                    ? await this.inspectRecordErrors(lease.db, schema.tableName, source.data, pageIds)
                    : [];
                const truncated = includeRecords && pageStart + pageIds.length < recordIds.length;
                const revisionValue = {
                    tableId,
                    displayName: table.displayName,
                    sqlName: table.relation,
                    rawSchemaSql: source.schema,
                    records: recordIds.map(id => [
                        id,
                        Object.fromEntries(
                            [...(source.data.get(id)?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b)),
                        ),
                    ]),
                };
                return {
                    tableId,
                    displayName: table.displayName,
                    sqlName: table.relation,
                    rawSchemaSql: source.schema,
                    schema,
                    recordCount: recordIds.length,
                    ...(includeRecords
                        ? {
                            records,
                            recordErrors,
                            page: {
                                limit: recordLimit,
                                truncated,
                                nextCursor: truncated ? this.encodeTableCursor(pageIds[pageIds.length - 1]) : undefined,
                            },
                        }
                        : {}),
                    revision: revisionOf(revisionValue),
                    provenance: {
                        sourceProjectId: table.sourceProjectId,
                        sourceTableId: table.sourceTableId,
                    },
                };
            } finally {
                lease.release();
                await source.disconnect();
            }
        });
    }

    private encodeTableCursor(recordId: string): string {
        return Buffer.from(JSON.stringify({ after: recordId }), "utf8").toString("base64url");
    }

    private decodeTableCursor(cursor: string): string {
        try {
            if (!/^[A-Za-z0-9_-]{1,500}$/.test(cursor)) throw new Error("invalid cursor");
            const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
            if (!parsed || typeof parsed !== "object" || typeof (parsed as { after?: unknown; }).after !== "string") {
                throw new Error("invalid cursor");
            }
            const after = (parsed as { after: string; }).after;
            if (!/^[\x20-\x7E]{1,500}$/.test(after) || this.encodeTableCursor(after) !== cursor) {
                throw new Error("invalid cursor");
            }
            return after;
        } catch {
            throw new McpReadError("invalid_argument", "Invalid record cursor");
        }
    }

    private serializeRecord(
        record: Y.Map<RelationValue> | undefined,
        columns: { name: string; kind: string; }[],
    ): Record<string, RelationValue> {
        const kinds = new Map(columns.map(column => [column.name, column.kind]));
        return Object.fromEntries(
            [...(record?.entries() ?? [])]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, value]) => {
                    const kind = kinds.get(name);
                    if (typeof value === "string" && kind === "date") {
                        const date = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
                        return [name, date ?? value];
                    }
                    if (typeof value === "string" && kind === "timestamp") {
                        const epoch = Date.parse(value);
                        return [name, Number.isNaN(epoch) ? value : new Date(epoch).toISOString()];
                    }
                    return [name, value];
                }),
        );
    }

    private async inspectRecordErrors(
        db: PGlite,
        relation: string,
        data: Y.Map<Y.Map<RelationValue>>,
        recordIds: string[],
    ): Promise<{ recordId: string; message: string; }[]> {
        const errors: { recordId: string; message: string; }[] = [];
        for (const recordId of recordIds) {
            const values: Record<string, RelationValue> = {
                ...Object.fromEntries(data.get(recordId)?.entries() ?? []),
                id: recordId,
            };
            const keys = Object.keys(values).filter(key => IDENT.test(key));
            try {
                await db.query(
                    `INSERT INTO "${relation.replace(/"/g, '""')}" (${
                        keys.map(key => `"${key.replace(/"/g, '""')}"`).join(",")
                    }) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")})`,
                    keys.map(key => values[key]),
                );
            } catch (error) {
                errors.push({
                    recordId,
                    message: error instanceof Error ? error.message : "Record could not be synchronized",
                });
            }
        }
        return errors;
    }

    private async inspectTableSchema(db: PGlite, rawSql: string) {
        const empty = {
            status: "invalid" as const,
            columns: [] as {
                name: string;
                dataType: string;
                kind: string;
                isNullable: boolean;
                isPrimaryKey: boolean;
                checkOptions?: string[];
            }[],
        };
        if (!rawSql.trim()) {
            return { ...empty, error: { code: "invalid_schema", message: "Schema definition is empty" } };
        }
        try {
            await db.exec(this.assertSingleCreateTable(rawSql));
            const tables = await db.query<{ table_name: string; }>(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
            );
            if (tables.rows.length !== 1) throw new Error("Schema definition must create exactly one table");
            const tableName = tables.rows[0].table_name;
            const columns = await db.query<{ column_name: string; data_type: string; is_nullable: string; }>(
                "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
                    + "WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
                [tableName],
            );
            const primaryKeys = await db.query<{ column_name: string; }>(
                "SELECT kcu.column_name FROM information_schema.table_constraints tc "
                    + "JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name "
                    + "AND kcu.table_schema = tc.table_schema WHERE tc.table_schema = 'public' "
                    + "AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'",
                [tableName],
            );
            const checks = await db.query<{ def: string; }>(
                "SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c "
                    + "JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace "
                    + "WHERE n.nspname = 'public' AND t.relname = $1 AND c.contype = 'c'",
                [tableName],
            );
            const options = new Map<string, string[]>();
            for (const { def } of checks.rows) {
                const column = def.match(/CHECK\s*\(+\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/i);
                const array = def.match(/ARRAY\s*\[([\s\S]*?)\]/i);
                if (!column || !array || !/=\s*ANY\s*\(/i.test(def)) continue;
                const values = [...array[1].matchAll(/'((?:[^']|'')*)'/g)].map(match => match[1].replace(/''/g, "'"));
                if (values.length) options.set(column[1] ?? column[2], values);
            }
            const pk = new Set(primaryKeys.rows.map(row => row.column_name));
            return {
                status: "valid" as const,
                tableName,
                columns: columns.rows.map(column => ({
                    name: column.column_name,
                    dataType: column.data_type,
                    kind: this.columnKind(column.data_type),
                    isNullable: column.is_nullable !== "NO",
                    isPrimaryKey: pk.has(column.column_name),
                    checkOptions: options.get(column.column_name),
                })),
            };
        } catch (error) {
            return {
                ...empty,
                error: { code: "invalid_schema", message: error instanceof Error ? error.message : "Invalid schema" },
            };
        }
    }

    /** Keep MCP schema acceptance aligned with the client schema parser. */
    private assertSingleCreateTable(sql: string): string {
        const trimmed = sql.trim();
        const stripped = trimmed
            .replace(/--[^\n]*/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/'(?:[^']|'')*'/g, "''")
            .replace(/"(?:[^"]|"")*"/g, '""');
        if (!/^\s*create\s+table\b/i.test(stripped)) {
            throw new Error("Schema definition must be a single CREATE TABLE statement");
        }
        if (stripped.replace(/;\s*$/, "").includes(";")) {
            throw new Error("Schema definition must contain exactly one statement");
        }
        if (/^\s*create\s+table\s+[^\s(]+\./i.test(stripped)) {
            throw new Error("Schema-qualified table names are not supported");
        }
        return trimmed;
    }

    private columnKind(dataType: string): string {
        const type = dataType.toLowerCase();
        if (type === "boolean") return "boolean";
        if (["smallint", "integer", "bigint"].includes(type)) return "integer";
        if (["numeric", "real", "double precision", "money"].includes(type)) return "number";
        if (type === "date") return "date";
        if (type.startsWith("timestamp")) return "timestamp";
        if (type === "text" || type.startsWith("character") || type === "uuid" || type.includes("char")) return "text";
        return "other";
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
                const bounded = select.replace(/;\s*$/, "");
                const result = await db.query<Record<string, unknown>>(
                    `SELECT * FROM (${bounded}) AS mcp_bounded_result LIMIT ${maxRows + 1}`,
                );
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

    private assertWriteSize(write: RelationWrite): void {
        const bytes = Buffer.byteLength(JSON.stringify(write), "utf8");
        if (bytes > MAX_WRITE_PAYLOAD_BYTES) {
            throw new McpReadError(
                "size_limit",
                `Write payload of ${bytes} bytes exceeds the ${MAX_WRITE_PAYLOAD_BYTES}-byte limit`,
                { actualBytes: bytes, limitBytes: MAX_WRITE_PAYLOAD_BYTES },
            );
        }
    }

    private rowRevision(record: Y.Map<RelationValue> | undefined): string {
        return revisionOf(record ? Object.fromEntries(record.entries()) : null);
    }

    writeRelation(
        uid: string,
        projectId: string,
        relation: string,
        write: RelationWrite,
        precondition: MutationPrecondition = {},
    ) {
        this.assertWriteSize(write);
        return this.withProject(uid, projectId, async doc => {
            const cacheKey = this.idempotency.key(
                "write_relation",
                uid,
                projectId,
                relation,
                precondition.dryRun ? undefined : precondition.operationId,
            );
            const { result, replayed } = await this.idempotency.run(cacheKey, async () => {
                const table = this.tables(doc).find(value => value.relation === relation);
                if (!table && relation !== "outline_items") throw new McpReadError("not_found", "Relation not found");
                if (!table) return this.writeOutline(Project.fromDoc(doc), write, precondition);
                return this.writeTableRelation(uid, projectId, table, write, precondition);
            });
            return { ...result, replayed };
        });
    }

    private async writeTableRelation(
        uid: string,
        projectId: string,
        table: TableEntry,
        write: RelationWrite,
        precondition: MutationPrecondition,
    ) {
        const source = await this.openTable(uid, projectId, table.tableId);
        try {
            const rowId = "rowId" in write ? write.rowId : String(write.values.id ?? crypto.randomUUID());
            await this.validateTableWrite(table.relation, source, write, rowId);
            const existing = source.data.get(rowId);
            const priorRevision = this.rowRevision(existing);
            if (write.op !== "INSERT") {
                if (!existing) throw new McpReadError("not_found", `Record "${rowId}" does not exist`);
                if (precondition.expectedRevision !== undefined) {
                    assertRevision(precondition.expectedRevision, priorRevision, { relation: table.relation, rowId });
                }
            }
            if (precondition.dryRun) {
                return {
                    relation: table.relation,
                    op: write.op,
                    rowId,
                    applied: false,
                    priorRevision,
                    revision: priorRevision,
                };
            }
            source.data.doc?.transact(() => {
                if (write.op === "INSERT") {
                    if (source.data.has(rowId)) {
                        throw new McpReadError("validation_failed", `Record "${rowId}" already exists`);
                    }
                    const record = new Y.Map<RelationValue>();
                    for (const [key, value] of Object.entries({ ...write.values, id: rowId })) {
                        record.set(key, value);
                    }
                    source.data.set(rowId, record);
                } else if (write.op === "UPDATE") {
                    existing!.set(write.column, write.value);
                } else {
                    source.data.delete(rowId);
                }
            }, "mcp-relation-write");
            return {
                relation: table.relation,
                op: write.op,
                rowId,
                applied: true,
                priorRevision,
                revision: this.rowRevision(source.data.get(rowId)),
            };
        } catch (error) {
            if (error instanceof McpReadError) throw error;
            throw new McpReadError("internal_failure", error instanceof Error ? error.message : String(error));
        } finally {
            await source.disconnect();
        }
    }

    setViewQuery(
        uid: string,
        projectId: string,
        kind: "grid" | "calendar",
        viewId: string,
        query: string,
        precondition: MutationPrecondition = {},
    ) {
        try {
            validateReadOnlySelect(query);
        } catch (error) {
            throw new McpReadError("invalid_argument", error instanceof Error ? error.message : String(error));
        }
        const bytes = Buffer.byteLength(query, "utf8");
        if (bytes > MAX_QUERY_BYTES) {
            throw new McpReadError("size_limit", `Query of ${bytes} bytes exceeds the ${MAX_QUERY_BYTES}-byte limit`, {
                actualBytes: bytes,
                limitBytes: MAX_QUERY_BYTES,
            });
        }
        return this.withProject(uid, projectId, doc => {
            const cacheKey = this.idempotency.key(
                "set_view_query",
                uid,
                projectId,
                `${kind}:${viewId}`,
                precondition.dryRun ? undefined : precondition.operationId,
            );
            return this.idempotency.run(cacheKey, () => {
                const registry = doc.getMap<Y.Map<unknown>>(kind === "grid" ? "yjsGrids" : "calendars");
                const view = registry.get(viewId);
                if (!view) throw new McpReadError("not_found", `${kind === "grid" ? "Grid" : "Calendar"} not found`);
                const priorRevision = revisionOf(String(view.get("query") ?? ""));
                if (precondition.expectedRevision !== undefined) {
                    assertRevision(precondition.expectedRevision, priorRevision, { kind, viewId });
                }
                if (precondition.dryRun) {
                    return { kind, viewId, query, applied: false, priorRevision, revision: priorRevision };
                }
                doc.transact(() => view.set("query", query), "mcp-view-query");
                return { kind, viewId, query, applied: true, priorRevision, revision: revisionOf(query) };
            }).then(({ result, replayed }) => ({ ...result, replayed }));
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

    private async validateTableWrite(relation: string, source: TableDoc, write: RelationWrite, rowId: string) {
        const lease = await acquireDb();
        try {
            await lease.db.exec(source.schema);
            await this.loadRecords(lease.db, relation, source.data);
            if (write.op === "INSERT") {
                const values: Record<string, RelationValue> = { ...write.values, id: rowId };
                const keys = Object.keys(values);
                await lease.db.query(
                    `INSERT INTO "${relation}" (${keys.map(key => `"${key.replace(/"/g, '""')}"`).join(",")}) VALUES (${
                        keys.map((_, index) => `$${index + 1}`).join(",")
                    })`,
                    keys.map(key => values[key]),
                );
            } else if (write.op === "UPDATE") {
                await lease.db.query(
                    `UPDATE "${relation}" SET "${write.column.replace(/"/g, '""')}" = $1 WHERE id = $2`,
                    [write.value, rowId],
                );
            }
        } catch (error) {
            throw this.sqlError(error, "validation_failed");
        } finally {
            lease.release();
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
            let parentId: string | null = item.parent?.parentKey ?? null;
            if (parentId === "root") parentId = null;
            let pageId = item.key;
            let cursor = item;
            while (cursor.parent && cursor.parent.parentKey !== "root") {
                pageId = cursor.parent.parentKey;
                const next = this.allItems(project).find(candidate => candidate.key === pageId);
                if (!next) break;
                cursor = next;
            }
            await db.query(
                `INSERT INTO outline_items VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                [
                    item.key,
                    pageId,
                    parentId,
                    item.text,
                    due,
                    Boolean(value.get("done")),
                    JSON.stringify(item.tags),
                    value.get("allDay"),
                    value.get("allDay") ? start : null,
                    value.get("allDay") ? null : start,
                    value.get("duration"),
                    rrule,
                    value.get("recurrenceDtstart"),
                    value.get("recurrenceTimezone"),
                    value.get("recurrenceParentId"),
                    value.get("recurrenceOccurrenceId"),
                ],
            );
        }
    }

    private writeOutline(project: Project, write: RelationWrite, precondition: MutationPrecondition) {
        this.assertWriteSize(write);
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
            if (precondition.dryRun) {
                return {
                    relation: "outline_items",
                    op: write.op,
                    rowId: undefined,
                    applied: false,
                    revision: revisionOf(null),
                };
            }
            const created = parent.items.addNode("mcp-relation-write");
            this.setItemValues(created, write.values);
            return {
                relation: "outline_items",
                op: write.op,
                rowId: created.key,
                applied: true,
                revision: outlineItemRevision(created),
            };
        }
        const item = items.find(candidate => candidate.key === write.rowId);
        if (!item) throw new McpReadError("not_found", `Item "${write.rowId}" does not exist`);
        const rowId = item.key;
        const priorRevision = outlineItemRevision(item);
        if (precondition.expectedRevision !== undefined) {
            assertRevision(precondition.expectedRevision, priorRevision, { relation: "outline_items", rowId });
        }
        // Validate an UPDATE's column before the dryRun early-return below,
        // so a dry run reports the same validation_failed a real apply
        // would (rather than a false "this would succeed").
        if (write.op === "UPDATE") this.assertItemColumns({ [write.column]: write.value });
        if (precondition.dryRun) {
            return {
                relation: "outline_items",
                op: write.op,
                rowId,
                applied: false,
                priorRevision,
                revision: priorRevision,
            };
        }
        if (write.op === "UPDATE") {
            this.setItemValues(item, { [write.column]: write.value });
            return {
                relation: "outline_items",
                op: write.op,
                rowId,
                applied: true,
                priorRevision,
                revision: outlineItemRevision(item),
            };
        }
        if (write.disposition === "delete-source") {
            item.delete();
            return {
                relation: "outline_items",
                op: write.op,
                rowId,
                applied: true,
                priorRevision,
                revision: revisionOf(null),
            };
        }
        for (const field of ["due", "start", "allDay", "rrule", "recurrenceDtstart", "recurrenceTimezone"]) {
            item.yMap.delete(field);
        }
        return {
            relation: "outline_items",
            op: write.op,
            rowId,
            applied: true,
            priorRevision,
            revision: outlineItemRevision(item),
        };
    }

    private setItemValues(item: Item, values: Record<string, RelationValue>) {
        const fields: Record<string, string> = {
            due: "due",
            duration: "duration",
            recurrence_dtstart: "recurrenceDtstart",
            recurrence_timezone: "recurrenceTimezone",
        };
        for (const [column, value] of Object.entries(values)) {
            if (column === "text") item.text = value == null ? "" : String(value);
            else if (column === "done" || column === "all_day") {
                const field = column === "done" ? "done" : "allDay";
                value == null ? item.yMap.delete(field) : item.yMap.set(field, this.toBoolean(value));
            } else if (column === "tags") this.writeTags(item, value);
            else if (column === "start_on" || column === "start_at") {
                if (value == null || value === "") {
                    item.yMap.delete("start");
                    item.yMap.delete("allDay");
                } else {
                    item.yMap.set("start", String(value));
                    item.yMap.set("allDay", column === "start_on");
                }
            } else if (column === "rrule") {
                if (value == null || value === "") item.yMap.delete("rrule");
                else {
                    item.yMap.set("rrule", String(value));
                    if (!item.yMap.get("recurrenceExdate")) item.yMap.set("recurrenceExdate", new Y.Array<string>());
                }
            } else if (fields[column]) {
                value == null
                    ? item.yMap.delete(fields[column])
                    : item.yMap.set(fields[column], String(value));
            } else if (column !== "id") {
                throw new McpReadError("validation_failed", `Column "${column}" is not writable`);
            }
        }
    }

    private assertItemColumns(values: Record<string, RelationValue>) {
        const writable = new Set([
            "id",
            "text",
            "due",
            "done",
            "tags",
            "all_day",
            "start_on",
            "start_at",
            "duration",
            "rrule",
            "recurrence_dtstart",
            "recurrence_timezone",
        ]);
        const invalid = Object.keys(values).find(column => !writable.has(column));
        if (invalid) throw new McpReadError("validation_failed", `Column "${invalid}" is not writable`);
    }

    private toBoolean(value: RelationValue): boolean {
        if (value === "true") return true;
        if (value === "false") return false;
        return Boolean(value);
    }

    private writeTags(item: Item, value: RelationValue) {
        let tags: string[] = [];
        if (typeof value === "string") {
            try {
                const parsed: unknown = JSON.parse(value);
                if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === "string");
            } catch { /* invalid JSON means an empty tag set, matching the canonical provider */ }
        }
        item.tags = tags;
    }

    private sqlError(
        error: unknown,
        code: "invalid_argument" | "validation_failed" = "invalid_argument",
    ): McpReadError {
        if (error instanceof McpReadError) return error;
        const sqlMessage = error instanceof Error ? error.message : String(error);
        return new McpReadError(code, `SQL query failed: ${sqlMessage}`, {
            stage: "sql_execution",
            sqlMessage,
        });
    }
}
