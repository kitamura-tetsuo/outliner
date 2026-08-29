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
