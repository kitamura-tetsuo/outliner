import { PGlite } from "@electric-sql/pglite";
import type { Hocuspocus } from "@hocuspocus/server";
import crypto from "crypto";
import * as Y from "yjs";
import { stripSqlNoise, validateReadOnlySelect } from "../../../shared/src/services/readOnlySql.js";
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
const MAX_TRACE_COLUMNS = 100;
const MAX_TRACE_VALUE_LENGTH = 200;
const MAX_RECORD_BATCH_SIZE = 100;
const MAX_RECORD_BATCH_BYTES = 64 * 1024;

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
    doc: Y.Doc;
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

    /** Release the shared scratch database when the owning server shuts down. */
    async destroy(): Promise<void> {
        await mcpDb.close();
    }

    getTableRevision(uid: string, projectId: string, tableId: string): Promise<string> {
        return this.withProject(uid, projectId, async doc => {
            const entry = doc.getMap<Y.Map<unknown>>("yjsTables").get(tableId);
            if (!entry) throw new McpReadError("not_found", "Table not found");
            const source = await this.openTable(uid, projectId, tableId);
            try {
                return this.tableRevision(
                    tableId,
                    String(entry.get("name") ?? ""),
                    String(entry.get("sqlName") ?? ""),
                    source,
                );
            } finally {
                await source.disconnect();
            }
        });
    }

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
            doc,
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

    /** Execute Schedule INSERT SQL in the same isolated PGlite materialization used by MCP SQL diagnostics. */
    previewScheduleRule(
        uid: string,
        projectId: string,
        candidate: { targetTableId: string; sql: string; },
        occurrence: string,
        resultLimit: number,
    ) {
        return this.withProject(uid, projectId, async doc => {
            const target = doc.getMap<Y.Map<unknown>>("yjsTables").get(candidate.targetTableId);
            if (!target) {
                return {
                    accepted: false,
                    candidateRows: [],
                    errors: [{ code: "missing_target", message: "Target Table not found" }],
                };
            }
            const lease = await acquireDb();
            const opened: TableDoc[] = [];
            let targetSource: TableDoc | undefined;
            try {
                for (const table of this.tables(doc)) {
                    const source = await this.openTable(uid, projectId, table.tableId);
                    opened.push(source);
                    if (table.tableId === candidate.targetTableId) targetSource = source;
                    if (!source.schema.trim()) continue;
                    await lease.db.exec(source.schema);
                    await this.loadRecordsTolerantly(lease.db, table.relation, source.data);
                }
                await lease.db.query("SELECT set_config('job.occurrence', $1, true)", [occurrence]);
                const result = await lease.db.query<Record<string, unknown>>(candidate.sql);
                const columns = (result.fields ?? []).map(field => field.name);
                return {
                    accepted: true,
                    candidateRows: result.rows.slice(0, resultLimit).map(row => this.boundedTraceRow(row, columns)),
                    truncated: result.rows.length > resultLimit,
                    errors: [],
                    targetRevision: targetSource
                        ? this.tableRevision(
                            candidate.targetTableId,
                            String(target.get("name") ?? ""),
                            String(target.get("sqlName") ?? ""),
                            targetSource,
                        )
                        : undefined,
                };
            } catch (error) {
                return { accepted: false, candidateRows: [], errors: [this.sqlDiagnostic(error, "execution")] };
            } finally {
                lease.release();
                await Promise.all(opened.map(table => table.disconnect()));
            }
        });
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
                const start = after === undefined ? 0 : recordIds.findIndex(id => id.localeCompare(after) > 0);
                const pageStart = start < 0 ? recordIds.length : start;
                const pageIds = includeRecords ? recordIds.slice(pageStart, pageStart + recordLimit) : [];
                const records = pageIds.map(recordId => ({
                    recordId,
                    values: this.serializeRecord(source.data.get(recordId), schema.columns),
                    revision: this.rowRevision(source.data.get(recordId)),
                }));
                const recordErrors = includeRecords && schema.status === "valid"
                    ? await this.inspectRecordErrors(lease.db, schema.tableName, schema.columns, source.data, pageIds)
                    : [];
                const truncated = includeRecords && pageStart + pageIds.length < recordIds.length;
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
                    revision: this.tableRevision(tableId, table.displayName, table.relation, source),
                    scheduleReferences: [...doc.getMap<Y.Map<unknown>>("schedules").entries()]
                        .sort(([a], [b]) => a.localeCompare(b))
                        .flatMap(([ruleId, rule]) => {
                            const kinds: ("write-target" | "sql-reference")[] = [];
                            if (rule.get("targetTableId") === tableId) kinds.push("write-target");
                            const sql = String(rule.get("sql") ?? "");
                            if (
                                rule.get("targetTableId") !== tableId
                                && table.relation
                                && new RegExp(
                                    `(?:^|[^A-Za-z0-9_])${
                                        table.relation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                                    }(?:$|[^A-Za-z0-9_])`,
                                    "i",
                                ).test(sql)
                            ) kinds.push("sql-reference");
                            return kinds.length
                                ? [{ ruleId, name: rule.get("name"), referenceKinds: kinds }]
                                : [];
                        }).slice(0, 25),
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
        columns: { name: string; dataType: string; kind: string; }[],
        data: Y.Map<Y.Map<RelationValue>>,
        pageIds: string[],
    ): Promise<{ recordId: string; column?: string; message: string; }[]> {
        const errors: { recordId: string; column?: string; message: string; }[] = [];
        const page = new Set(pageIds);
        // The client adapter materializes every record into one relation. Do
        // the same here so UNIQUE/FK constraints spanning pages are diagnosed
        // correctly, while returning only errors for the requested page.
        for (const [recordId, record] of data) {
            const values: unknown[] = [];
            let castFailed = false;
            for (const column of columns) {
                const raw = column.name === "id" ? recordId : record.get(column.name);
                try {
                    values.push(this.castRecordValue(raw, column));
                } catch (error) {
                    castFailed = true;
                    if (page.has(recordId)) {
                        errors.push({
                            recordId,
                            column: column.name,
                            message: error instanceof Error ? error.message : "Record value could not be cast",
                        });
                    }
                    break;
                }
            }
            if (castFailed) continue;
            try {
                await db.query(
                    `INSERT INTO "${relation.replace(/"/g, '""')}" (${
                        columns.map(column => `"${column.name.replace(/"/g, '""')}"`).join(",")
                    }) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
                    values,
                );
            } catch (error) {
                if (page.has(recordId)) {
                    errors.push({
                        recordId,
                        message: error instanceof Error ? error.message : "Record could not be synchronized",
                    });
                }
            }
        }
        return errors;
    }

    private castRecordValue(value: unknown, column: { name: string; dataType: string; kind: string; }): unknown {
        if (value === null || value === undefined) return null;
        if (typeof value === "string" && value === "" && column.kind !== "text") return null;
        const invalid = (expected: string) => {
            throw new Error(
                `Value ${
                    JSON.stringify(value)
                } is not a valid ${expected} for column "${column.name}" (${column.dataType})`,
            );
        };
        if (column.kind === "text") {
            if (["string", "number", "boolean"].includes(typeof value)) return String(value);
            return invalid("text");
        }
        if (column.kind === "integer") {
            if (typeof value === "number" && Number.isInteger(value)) return value;
            if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10);
            return invalid("integer");
        }
        if (column.kind === "number") {
            if (typeof value === "number" && Number.isFinite(value)) return value;
            if (typeof value === "string" && value.trim() && Number.isFinite(Number(value.trim()))) {
                return Number(value.trim());
            }
            return invalid("number");
        }
        if (column.kind === "boolean") {
            if (typeof value === "boolean") return value;
            if (value === "true") return true;
            if (value === "false") return false;
            return invalid("boolean");
        }
        if (column.kind === "date") {
            if (typeof value === "string" && this.isCalendarDate(value)) return value;
            return invalid("date (YYYY-MM-DD)");
        }
        if (column.kind === "timestamp") {
            if (typeof value === "string" && this.isTimestamp(value)) return value;
            return invalid("timestamp (YYYY-MM-DDTHH:MM[:SS])");
        }
        if (typeof value === "string") return value;
        return invalid(column.dataType);
    }

    private isCalendarDate(value: string): boolean {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }

    private isTimestamp(value: string): boolean {
        const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?Z?$/.exec(value);
        return Boolean(
            match && this.isCalendarDate(match[1]) && Number(match[2]) <= 23 && Number(match[3]) <= 59
                && Number(match[4] ?? 0) < 60,
        );
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
            if (columns.rows.length === 0) throw new Error("Table must define at least one column");
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

    /** Validate a proposed schema against real Table records in scratch SQL state only. */
    validateTableSchema(uid: string, projectId: string, tableId: string, schemaSql: string) {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(tableId)) {
            throw new McpReadError("invalid_argument", "Invalid table ID");
        }
        if (Buffer.byteLength(schemaSql, "utf8") > MAX_QUERY_BYTES) {
            throw new McpReadError("size_limit", "Schema definition exceeds the 16 KiB limit");
        }
        return this.withProject(uid, projectId, async doc => {
            if (!doc.getMap("yjsTables").has(tableId)) throw new McpReadError("not_found", "Table not found");
            const source = await this.openTable(uid, projectId, tableId);
            const lease = await acquireDb();
            try {
                const current = await this.inspectTableSchema(lease.db, source.schema);
                await this.clearScratchDatabase(lease.db);
                const parsedSchema = await this.inspectTableSchema(lease.db, schemaSql);
                if (parsedSchema.status === "invalid") {
                    return {
                        accepted: false,
                        parsedSchema,
                        migrationDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
                        affectedRecords: { total: source.data.size, incompatible: 0 },
                        warnings: [],
                        errors: [this.schemaDiagnostic(parsedSchema.error)],
                    };
                }
                const nameError = parsedSchema.tableName === "outline_items"
                    ? `Table name "${parsedSchema.tableName}" is reserved`
                    : [...doc.getMap<Y.Map<unknown>>("yjsTables").entries()].some(([id, entry]) =>
                            id !== tableId && entry.get("sqlName") === parsedSchema.tableName
                        )
                    ? `Table name "${parsedSchema.tableName}" is already used by another Table`
                    : undefined;
                if (nameError) {
                    return {
                        accepted: false,
                        parsedSchema,
                        migrationDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
                        affectedRecords: { total: source.data.size, incompatible: 0 },
                        warnings: [],
                        errors: [{
                            phase: "schema-validation",
                            message: nameError,
                            code: "relation_name_unavailable",
                            hint: "Choose a unique, non-system table name",
                        }],
                    };
                }
                const oldColumns = new Map(current.columns.map(column => [column.name, column]));
                const newColumns = new Map(parsedSchema.columns.map(column => [column.name, column]));
                const addedColumns = parsedSchema.columns.filter(column => !oldColumns.has(column.name)).map(c =>
                    c.name
                );
                const removedColumns = current.columns.filter(column => !newColumns.has(column.name)).map(c => c.name);
                const changedColumns = parsedSchema.columns.flatMap(column => {
                    const before = oldColumns.get(column.name);
                    return before && (before.dataType !== column.dataType || before.isNullable !== column.isNullable)
                        ? [{
                            name: column.name,
                            fromType: before.dataType,
                            toType: column.dataType,
                            fromNullable: before.isNullable,
                            toNullable: column.isNullable,
                        }]
                        : [];
                });
                const ids = [...source.data.keys()];
                const recordErrors = await this.inspectRecordErrors(
                    lease.db,
                    parsedSchema.tableName,
                    parsedSchema.columns,
                    source.data,
                    ids,
                );
                const incompatible = new Set(recordErrors.map(error => error.recordId)).size;
                const warnings = [
                    ...removedColumns.map(name => `Column "${name}" would be removed`),
                    ...changedColumns.map(change =>
                        `Column "${change.name}" would change from ${change.fromType} to ${change.toType}`
                    ),
                    ...(incompatible ? [`${incompatible} record(s) are incompatible with the proposed schema`] : []),
                ];
                return {
                    accepted: recordErrors.length === 0,
                    parsedSchema,
                    migrationDiff: { addedColumns, removedColumns, changedColumns },
                    affectedRecords: { total: source.data.size, incompatible, recordErrors },
                    warnings,
                    errors: recordErrors.map(error => ({
                        phase: "data-validation",
                        message: error.message,
                        ...(error.column
                            ? { hint: `Repair column "${error.column}" in record "${error.recordId}"` }
                            : {}),
                    })),
                };
            } finally {
                lease.release();
                await source.disconnect();
            }
        });
    }

    /**
     * Migrate a Table's schema through the exact same dry-run validator
     * exposed by validate_table_schema, then apply it behind the shared
     * write-scope contract: an expectedRevision precondition covering the
     * whole Table (schema + every record, see tableRevision), an
     * operationId for safe retries, and a dryRun mode that reports the
     * migration without applying it.
     *
     * A migration that would remove or retype a column is destructive and
     * is rejected with destructive_confirmation_required unless the caller
     * passes acknowledgeDestructive: true — the MCP tool contract has no
     * interactive confirmation step, so the explicit flag is the
     * confirmation. A dry run always reports the diff without needing it,
     * since nothing is persisted.
     */
    async updateTableSchema(
        uid: string,
        projectId: string,
        tableId: string,
        schemaSql: string,
        precondition: MutationPrecondition & { expectedRevision: string; acknowledgeDestructive?: boolean; },
    ) {
        const cacheKey = this.idempotency.key(
            "update_table_schema",
            uid,
            projectId,
            tableId,
            precondition.dryRun ? undefined : precondition.operationId,
        );
        const { result, replayed } = await this.idempotency.run(cacheKey, async () => {
            const validation = await this.validateTableSchema(uid, projectId, tableId, schemaSql);
            if (!validation.accepted) {
                throw new McpReadError("validation_failed", "Table schema validation failed", { validation });
            }
            const destructive = validation.migrationDiff.removedColumns.length > 0
                || validation.migrationDiff.changedColumns.length > 0;
            if (destructive && !precondition.dryRun && !precondition.acknowledgeDestructive) {
                throw new McpReadError(
                    "destructive_confirmation_required",
                    "This migration removes or retypes column(s); retry with acknowledgeDestructive: true to apply it",
                    { validation, migrationDiff: validation.migrationDiff },
                );
            }
            return this.withProject(uid, projectId, async doc => {
                const entry = doc.getMap<Y.Map<unknown>>("yjsTables").get(tableId);
                if (!entry) throw new McpReadError("not_found", "Table not found");
                const displayName = String(entry.get("name") ?? "");
                const priorSqlName = String(entry.get("sqlName") ?? "");
                const source = await this.openTable(uid, projectId, tableId);
                try {
                    const priorRevision = this.tableRevision(tableId, displayName, priorSqlName, source);
                    assertRevision(precondition.expectedRevision, priorRevision, { tableId });
                    if (precondition.dryRun) {
                        return {
                            tableId,
                            applied: false,
                            destructive,
                            priorRevision,
                            revision: priorRevision,
                            validation,
                        };
                    }
                    const removedColumns = validation.migrationDiff.removedColumns;
                    const trimmedSql = schemaSql.trim();
                    const newSqlName = validation.parsedSchema.status === "valid"
                        ? validation.parsedSchema.tableName
                        : priorSqlName;
                    // validateTableSchema already checked name availability, but
                    // against a separate, earlier connection: another Table could
                    // have been concurrently renamed to the same SQL name since
                    // then. Recheck against this call's own live `doc` immediately
                    // before writing anything, so two concurrent renames can never
                    // both succeed and leave two Tables sharing one SQL name.
                    if (newSqlName !== priorSqlName) {
                        const nameTaken = [...doc.getMap<Y.Map<unknown>>("yjsTables").entries()].some(
                            ([otherId, otherEntry]) => otherId !== tableId && otherEntry.get("sqlName") === newSqlName,
                        );
                        if (nameTaken) {
                            throw new McpReadError(
                                "validation_failed",
                                `Table name "${newSqlName}" is already used by another Table`,
                                { tableId, sqlName: newSqlName },
                            );
                        }
                    }
                    // One transaction on the Table's own subdoc replaces the
                    // schema text and strips any now-removed columns from
                    // every record together, so a half-migrated schema/data
                    // pair is never observable. Unlike write_relation and
                    // set_view_query, this deliberately transacts with the
                    // default (untracked) origin rather than a labeled one:
                    // a live client's own Y.UndoManager for this Table
                    // tracks exactly that origin (see tableDocs.ts), so an
                    // MCP-applied migration can be undone like any other
                    // local edit.
                    source.doc.transact(() => {
                        const schemaText = source.doc.getText("schema");
                        schemaText.delete(0, schemaText.length);
                        schemaText.insert(0, trimmedSql);
                        if (removedColumns.length > 0) {
                            for (const record of source.data.values()) {
                                for (const column of removedColumns) {
                                    if (record.has(column)) record.delete(column);
                                }
                            }
                        }
                    });
                    if (entry.get("sqlName") !== newSqlName) {
                        doc.transact(() => entry.set("sqlName", newSqlName));
                    }
                    const revision = this.tableRevision(tableId, displayName, newSqlName, source);
                    return { tableId, applied: true, destructive, priorRevision, revision, validation };
                } finally {
                    await source.disconnect();
                }
            });
        });
        return { ...result, replayed };
    }

    /** Execute a proposed Grid query through the production validator and materializer without saving it. */
    validateGridQuery(uid: string, projectId: string, gridId: string, query: string, resultLimit = 25) {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(gridId)) throw new McpReadError("invalid_argument", "Invalid Grid ID");
        if (!Number.isInteger(resultLimit) || resultLimit < 1 || resultLimit > 100) {
            throw new McpReadError("invalid_argument", "resultLimit must be an integer from 1 to 100");
        }
        return this.withProject(uid, projectId, async doc => {
            const grid = doc.getMap<Y.Map<unknown>>("yjsGrids").get(gridId);
            if (!grid) throw new McpReadError("not_found", "Grid not found");
            let normalizedQuery: string;
            try {
                normalizedQuery = validateReadOnlySelect(query);
            } catch (error) {
                return {
                    accepted: false,
                    query,
                    dependencies: [],
                    resultColumns: [],
                    sampleRows: [],
                    editability: { editable: false, readOnlyReason: "Query validation failed", editableColumns: [] },
                    errors: [this.sqlDiagnostic(error, "validation")],
                };
            }
            const lease = await acquireDb();
            const opened: TableDoc[] = [];
            try {
                await lease.db.exec(SYSTEM_SCHEMA);
                await this.loadOutlineItems(lease.db, Project.fromDoc(doc));
                const schemaColumns = new Map<string, string[]>();
                const materializationWarnings: { relation: string; recordId: string; message: string; }[] = [];
                for (const table of this.tables(doc)) {
                    const source = await this.openTable(uid, projectId, table.tableId);
                    opened.push(source);
                    if (!source.schema.trim()) continue;
                    await lease.db.exec(source.schema);
                    materializationWarnings.push(
                        ...await this.loadRecordsTolerantly(lease.db, table.relation, source.data),
                    );
                    const schema = await lease.db.query<{ column_name: string; }>(
                        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
                        [table.relation],
                    );
                    schemaColumns.set(table.relation, schema.rows.map(row => row.column_name));
                }
                const bounded = normalizedQuery.replace(/;\s*$/, "");
                const result = await lease.db.query<Record<string, unknown>>(
                    `SELECT * FROM (${bounded}\n) AS mcp_grid_validation LIMIT ${resultLimit + 1}`,
                );
                const resultColumns = (result.fields ?? []).map(field => ({
                    name: field.name,
                    type: String(field.dataTypeID),
                }));
                const dependencies = await this.queryPlanDependencies(
                    lease.db,
                    bounded,
                    ["outline_items", ...schemaColumns.keys()],
                );
                const sourceColumns = dependencies.length === 1 ? schemaColumns.get(dependencies[0]) ?? [] : [];
                const columnNames = resultColumns.map(column => column.name);
                const analyzed = stripSqlNoise(normalizedQuery);
                return {
                    accepted: true,
                    normalizedQuery,
                    dependencies,
                    resultColumns,
                    sampleRows: result.rows.slice(0, resultLimit).map(row => this.boundedTraceRow(row, columnNames)),
                    truncated: result.rows.length > resultLimit,
                    editability: dependencies.length === 1
                        ? this.gridEditability(normalizedQuery, sourceColumns, columnNames)
                        : {
                            editable: false,
                            readOnlyReason: "Query does not resolve to exactly one source relation",
                            editableColumns: [],
                        },
                    inferredOrdering: /\border\s+by\b/i.test(analyzed) ? "sql-order-by" : "incidental-source-order",
                    warnings: materializationWarnings,
                    errors: [],
                };
            } catch (error) {
                return {
                    accepted: false,
                    normalizedQuery,
                    dependencies: [],
                    resultColumns: [],
                    sampleRows: [],
                    editability: { editable: false, readOnlyReason: "Query execution failed", editableColumns: [] },
                    errors: [this.sqlDiagnostic(error, "execution")],
                };
            } finally {
                for (const source of opened) await source.disconnect();
                lease.release();
            }
        });
    }

    private async queryPlanDependencies(db: PGlite, query: string, relations: string[]): Promise<string[]> {
        // PostgreSQL's plan resolves quoting, CTE shadowing, joins, and nested
        // queries for us, so dependency reporting follows execution rather
        // than attempting to reinterpret SQL with a regular expression.
        const explained = await db.query<Record<string, unknown>>(`EXPLAIN (FORMAT JSON) ${query}`);
        const found = new Set<string>();
        const allowed = new Set(relations);
        const visit = (value: unknown): void => {
            if (Array.isArray(value)) {
                value.forEach(visit);
            } else if (value && typeof value === "object") {
                for (const [key, nested] of Object.entries(value)) {
                    if (key === "Relation Name" && typeof nested === "string" && allowed.has(nested)) found.add(nested);
                    visit(nested);
                }
            }
        };
        visit(explained.rows);
        return relations.filter(relation => found.has(relation));
    }

    /** Match the browser adapter: one malformed record must not hide valid rows from a Grid. */
    private async loadRecordsTolerantly(db: PGlite, relation: string, data: Y.Map<Y.Map<RelationValue>>) {
        const warnings: { relation: string; recordId: string; message: string; }[] = [];
        for (const [recordId, record] of data) {
            try {
                await this.loadRecords(db, relation, [[recordId, record]]);
            } catch (error) {
                warnings.push({
                    relation,
                    recordId,
                    message: error instanceof Error ? error.message : "Record could not be materialized",
                });
            }
        }
        return warnings;
    }

    private schemaDiagnostic(error: { code: string; message: string; }) {
        return {
            phase: "schema-parse",
            message: error.message,
            code: error.code,
            hint: "Provide exactly one valid CREATE TABLE statement",
        };
    }

    private async clearScratchDatabase(db: PGlite) {
        const tables = await db.query<{ tablename: string; }>(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
        );
        for (const { tablename } of tables.rows) {
            await db.exec(`DROP TABLE IF EXISTS "${tablename.replace(/"/g, '""')}" CASCADE`);
        }
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

    /**
     * Build a bounded, server-observed Grid trace.  The shape intentionally
     * follows the config/query/client/render stages used by the browser's
     * gridRenderTrace rather than introducing an MCP-only tracing model.
     */
    async traceGrid(uid: string, projectId: string, gridId: string, maxRows = 25) {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(gridId)) throw new McpReadError("invalid_argument", "Invalid Grid ID");
        if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100) {
            throw new McpReadError("invalid_argument", "maxRows must be an integer from 1 to 100");
        }
        return this.withProject(uid, projectId, async doc => {
            const grid = doc.getMap<Y.Map<unknown>>("yjsGrids").get(gridId);
            if (!grid) throw new McpReadError("not_found", "Grid not found");
            const sourceTableId = String(grid.get("sourceTableId") ?? "");
            const sourceEntry = doc.getMap<Y.Map<unknown>>("yjsTables").get(sourceTableId);
            const query = String(grid.get("query") ?? "");
            const columnOrder = this.stringArray(grid.get("columnOrder"));
            const components = grid.get("components");
            const hiddenColumns = components instanceof Y.Map
                ? [...components.entries()].filter(([, value]) =>
                    value instanceof Y.Map && value.get("hidden") === true
                )
                    .map(([name]) => name)
                : [];
            const configRevision = revisionOf({
                gridId,
                sourceTableId,
                query,
                columnOrder,
                hiddenColumns,
                stateVector: Buffer.from(Y.encodeStateVector(doc)).toString("base64url"),
            });
            const trace: Record<string, unknown> = {
                version: 1,
                gridId,
                sourceTableId,
                revision: configRevision,
                stages: [{
                    stage: "config",
                    observed: true,
                    revision: configRevision,
                    name: String(grid.get("name") ?? ""),
                    sourceTableId,
                    query,
                    columnOrder,
                    hiddenColumns,
                }],
            };
            const stages = trace.stages as Record<string, unknown>[];
            if (!sourceEntry) {
                stages.push({
                    stage: "source",
                    observed: true,
                    sourceTableId,
                    status: "stale",
                    error: { phase: "source", message: "Source Table is not registered" },
                });
                return trace;
            }

            const lease = await acquireDb();
            const opened: TableDoc[] = [];
            try {
                await lease.db.exec(SYSTEM_SCHEMA);
                await this.loadOutlineItems(lease.db, Project.fromDoc(doc));
                let sourceRevision = "";
                let sourceSchema = "";
                for (const table of this.tables(doc)) {
                    const source = await this.openTable(uid, projectId, table.tableId);
                    opened.push(source);
                    if (table.tableId === sourceTableId) {
                        sourceSchema = source.schema;
                        sourceRevision = revisionOf({
                            schema: source.schema,
                            stateVector: Buffer.from(Y.encodeStateVector(source.doc)).toString("base64url"),
                        });
                    }
                    if (!source.schema.trim()) continue;
                    await lease.db.exec(source.schema);
                    await this.loadRecords(lease.db, table.relation, source.data);
                }
                const sourceSqlName = String(sourceEntry.get("sqlName") ?? "");
                const schemaColumns = sourceSchema
                    ? (await lease.db.query<{ column_name: string; }>(
                        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' "
                            + "AND table_name = $1 ORDER BY ordinal_position",
                        [sourceSqlName],
                    )).rows.map(column => column.column_name)
                    : [];
                stages.push({
                    stage: "source",
                    observed: true,
                    sourceTableId,
                    sqlName: sourceSqlName,
                    schemaRevision: sourceRevision,
                    schemaColumns,
                    status: sourceRevision ? "current" : "unavailable",
                });
                let select: string;
                try {
                    select = validateReadOnlySelect(query);
                } catch (error) {
                    stages.push({
                        stage: "query-execution",
                        observed: true,
                        status: "error",
                        error: this.sqlDiagnostic(error, "validation"),
                    });
                    return trace;
                }
                try {
                    const bounded = select.replace(/;\s*$/, "");
                    const result = await lease.db.query<Record<string, unknown>>(
                        `SELECT * FROM (${bounded}\n) AS mcp_grid_trace LIMIT ${maxRows + 1}`,
                    );
                    const columns = (result.fields ?? []).map(field => field.name).slice(0, MAX_TRACE_COLUMNS);
                    const rows = result.rows.slice(0, maxRows);
                    const editability = this.gridEditability(select, schemaColumns, columns);
                    const ordered = [
                        ...columnOrder.filter(column => columns.includes(column)),
                        ...columns.filter(column => !columnOrder.includes(column)),
                    ];
                    const renderedColumns = ordered.filter(column => !hiddenColumns.includes(column));
                    const analyzedSql = stripSqlNoise(select);
                    const orderSource = /\border\s+by\b/i.test(analyzedSql)
                        ? "sql-order-by"
                        : "incidental-source-order";
                    stages.push({
                        stage: "query-execution",
                        observed: true,
                        status: "completed",
                        orderSource,
                        columns,
                        rows: rows.map((values, index) => ({
                            identity: this.rowIdentity(values, index),
                            values: this.boundedTraceRow(values, columns),
                        })),
                        rowCount: rows.length,
                        totalCount: result.rows.length > maxRows ? undefined : rows.length,
                        truncated: result.rows.length > maxRows,
                        editability,
                    });
                    stages.push({
                        stage: "render",
                        observed: false,
                        inferredFrom: "stored-grid-config-and-query-result",
                        columns: renderedColumns,
                        columnCount: renderedColumns.length,
                        rowCount: rows.length,
                        orderSource,
                        transforms: {
                            hiddenColumns,
                            presentationColumnOrder: ordered,
                            filtering: /\bwhere\b/i.test(analyzedSql) ? "sql" : "none",
                            sorting: orderSource,
                        },
                    });
                } catch (error) {
                    stages.push({
                        stage: "query-execution",
                        observed: true,
                        status: "error",
                        error: this.sqlDiagnostic(error, "execution"),
                    });
                }
                return trace;
            } finally {
                for (const source of opened) await source.disconnect();
                lease.release();
            }
        });
    }

    private stringArray(value: unknown): string[] {
        const values = value instanceof Y.Array ? value.toArray() : Array.isArray(value) ? value : [];
        return values.filter((entry): entry is string => typeof entry === "string").slice(0, 100);
    }

    private rowIdentity(row: Record<string, unknown>, ordinal: number) {
        if (typeof row.source_kind === "string" && typeof row.source_id === "string") {
            return { kind: "source", relation: row.source_kind, value: row.source_id };
        }
        if (typeof row.id === "string") return { kind: "id", value: row.id };
        return { kind: "result-ordinal", value: ordinal, stable: false };
    }

    private gridEditability(query: string, schemaColumns: string[], resultColumns: string[]) {
        const readOnly = (reason: string) => ({ editable: false, readOnlyReason: reason, editableColumns: [] });
        const analyzedSql = stripSqlNoise(query);
        if (
            /\b(join|group\s+by|distinct)\b/i.test(analyzedSql)
            || /\b(count|sum|avg|min|max)\s*\(/i.test(analyzedSql)
        ) {
            return readOnly("Rows are combined, aggregated, or distinct");
        }
        const identity = resultColumns.includes("source_kind") && resultColumns.includes("source_id")
            ? "source"
            : resultColumns.includes("id")
            ? "id"
            : undefined;
        if (!identity) return readOnly("Query result has no stable row identity");
        return {
            editable: true,
            rowIdentity: identity,
            editableColumns: resultColumns.filter(column =>
                schemaColumns.includes(column) && !["id", "source_kind", "source_id"].includes(column)
            ),
        };
    }

    private boundedTraceRow(row: Record<string, unknown>, columns: string[]): Record<string, unknown> {
        return Object.fromEntries(columns.map(column => [column, this.boundedTraceValue(row[column])]));
    }

    private boundedTraceValue(value: unknown): unknown {
        if (typeof value === "string") {
            return value.length > MAX_TRACE_VALUE_LENGTH
                ? `${value.slice(0, MAX_TRACE_VALUE_LENGTH)}…`
                : value;
        }
        if (typeof value === "bigint") return value.toString();
        if (value === undefined || value === null || ["number", "boolean"].includes(typeof value)) return value;
        try {
            const serialized = JSON.stringify(
                value,
                (_key, nested: unknown) => typeof nested === "bigint" ? nested.toString() : nested,
            );
            if (serialized === undefined) return String(value).slice(0, MAX_TRACE_VALUE_LENGTH);
            return serialized.length > MAX_TRACE_VALUE_LENGTH
                ? `${serialized.slice(0, MAX_TRACE_VALUE_LENGTH)}…`
                : JSON.parse(serialized);
        } catch {
            return String(value).slice(0, MAX_TRACE_VALUE_LENGTH);
        }
    }

    private sqlDiagnostic(error: unknown, phase: "validation" | "execution") {
        const value = error as { message?: unknown; code?: unknown; position?: unknown; hint?: unknown; };
        return {
            phase,
            message: typeof value?.message === "string" ? value.message : String(error),
            ...(typeof value?.position === "string" || typeof value?.position === "number"
                ? { position: Number(value.position) }
                : {}),
            ...(typeof value?.code === "string" ? { code: value.code } : {}),
            ...(typeof value?.hint === "string" ? { hint: value.hint } : {}),
        };
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

    /**
     * Content-hash revision for a whole Table (registry metadata, schema
     * text, and every record), shared by get_table and both Table mutation
     * tools so a client can read it from one and pass it back as the
     * other's expectedRevision. It changes on ANY schema or record change,
     * which is intentionally coarse: update_table_schema and
     * update_table_records both need to guard against a concurrent edit to
     * either half of the same Table, not just the field they happen to be
     * writing. Reads the schema text and state vector live off `source.doc`
     * rather than the TableDoc snapshot fields, so it reflects a mutation
     * already applied earlier in the same call.
     */
    private tableRevision(tableId: string, displayName: string, sqlName: string, source: TableDoc): string {
        return revisionOf({
            tableId,
            displayName,
            sqlName,
            rawSchemaSql: source.doc.getText("schema").toString(),
            tableStateVector: Buffer.from(Y.encodeStateVector(source.doc)).toString("base64url"),
        });
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

    /**
     * Cast and insert a plain-value snapshot of every given record into a
     * freshly created scratch relation, reporting one message per record
     * that fails to cast or violates a real constraint (NOT NULL, CHECK,
     * UNIQUE, ...). Used by update_table_records to compare "before" and
     * "after" batches of a proposed change against the exact same engine
     * validate_table_schema and get_table already use, without touching
     * the live Yjs data.
     */
    private async materializeRecordErrors(
        db: PGlite,
        tableName: string,
        columns: { name: string; dataType: string; kind: string; }[],
        records: Map<string, Record<string, unknown>>,
    ): Promise<Map<string, string>> {
        const errors = new Map<string, string>();
        for (const [recordId, values] of records) {
            const row: unknown[] = [];
            let castFailed = false;
            for (const column of columns) {
                const raw = column.name === "id" ? recordId : values[column.name];
                try {
                    row.push(this.castRecordValue(raw, column));
                } catch (error) {
                    castFailed = true;
                    errors.set(recordId, error instanceof Error ? error.message : "Record value could not be cast");
                    break;
                }
            }
            if (castFailed) continue;
            try {
                await db.query(
                    `INSERT INTO "${tableName.replace(/"/g, '""')}" (${
                        columns.map(column => `"${column.name.replace(/"/g, '""')}"`).join(",")
                    }) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
                    row,
                );
            } catch (error) {
                errors.set(recordId, error instanceof Error ? error.message : "Record could not be validated");
            }
        }
        return errors;
    }

    /**
     * Update Table records by stable record ID in one atomic, all-or-nothing
     * batch — never by displayed row index, and never creating a record
     * that does not already exist. The batch is validated as a whole
     * against the Table's real schema constraints (NOT NULL, CHECK,
     * UNIQUE) before anything is written: a change is rejected if it would
     * make the changed record itself invalid, or if it would newly break a
     * constraint that the untouched rest of the Table currently satisfies
     * (for example a UNIQUE column colliding with a value this batch
     * writes). A single expectedRevision precondition covers the whole
     * Table, matching tableRevision/get_table, so a batch can never
     * silently land over a concurrent collaborator's edit to the schema or
     * to a record outside the batch.
     */
    async updateTableRecords(
        uid: string,
        projectId: string,
        tableId: string,
        changes: { recordId: string; values: Record<string, RelationValue>; }[],
        precondition: MutationPrecondition & { expectedRevision: string; },
    ) {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(tableId)) throw new McpReadError("invalid_argument", "Invalid table ID");
        if (changes.length === 0) {
            throw new McpReadError("invalid_argument", "changes must contain at least one record");
        }
        if (changes.length > MAX_RECORD_BATCH_SIZE) {
            throw new McpReadError(
                "size_limit",
                `changes contains ${changes.length} records, exceeding the ${MAX_RECORD_BATCH_SIZE}-record batch limit`,
                { actualCount: changes.length, limitCount: MAX_RECORD_BATCH_SIZE },
            );
        }
        const seenIds = new Set<string>();
        for (const change of changes) {
            if (seenIds.has(change.recordId)) {
                throw new McpReadError("invalid_argument", `Duplicate recordId "${change.recordId}" in changes`);
            }
            seenIds.add(change.recordId);
        }
        const payloadBytes = Buffer.byteLength(JSON.stringify(changes), "utf8");
        if (payloadBytes > MAX_RECORD_BATCH_BYTES) {
            throw new McpReadError(
                "size_limit",
                `changes payload of ${payloadBytes} bytes exceeds the ${MAX_RECORD_BATCH_BYTES}-byte limit`,
                { actualBytes: payloadBytes, limitBytes: MAX_RECORD_BATCH_BYTES },
            );
        }
        return this.withProject(uid, projectId, async doc => {
            const cacheKey = this.idempotency.key(
                "update_table_records",
                uid,
                projectId,
                tableId,
                precondition.dryRun ? undefined : precondition.operationId,
            );
            const { result, replayed } = await this.idempotency.run(cacheKey, async () => {
                const entry = doc.getMap<Y.Map<unknown>>("yjsTables").get(tableId);
                if (!entry) throw new McpReadError("not_found", "Table not found");
                const displayName = String(entry.get("name") ?? "");
                const sqlName = String(entry.get("sqlName") ?? "");
                const source = await this.openTable(uid, projectId, tableId);
                const lease = await acquireDb();
                try {
                    const schema = await this.inspectTableSchema(lease.db, source.schema);
                    if (schema.status !== "valid") {
                        throw new McpReadError("validation_failed", "Table has no valid applied schema", { tableId });
                    }
                    const columnsByName = new Map(schema.columns.map(column => [column.name, column]));
                    for (const change of changes) {
                        if (!source.data.has(change.recordId)) {
                            throw new McpReadError("not_found", `Record "${change.recordId}" does not exist`, {
                                recordId: change.recordId,
                            });
                        }
                        if (Object.keys(change.values).length === 0) {
                            throw new McpReadError(
                                "invalid_argument",
                                `Record "${change.recordId}" has no values to change`,
                            );
                        }
                        for (const [column, value] of Object.entries(change.values)) {
                            if (column === "id") {
                                if (value !== change.recordId) {
                                    throw new McpReadError(
                                        "validation_failed",
                                        `Record "${change.recordId}" cannot change its own id`,
                                        { recordId: change.recordId },
                                    );
                                }
                                continue;
                            }
                            const columnSchema = columnsByName.get(column);
                            if (!columnSchema) {
                                throw new McpReadError(
                                    "validation_failed",
                                    `Column "${column}" does not exist on this Table`,
                                    { recordId: change.recordId, column },
                                );
                            }
                            try {
                                this.castRecordValue(value, columnSchema);
                            } catch (error) {
                                throw new McpReadError(
                                    "validation_failed",
                                    error instanceof Error ? error.message : "Invalid value",
                                    { recordId: change.recordId, column },
                                );
                            }
                        }
                    }
                    const originalValues = new Map(
                        [...source.data.entries()].map(([id, record]) => [id, Object.fromEntries(record.entries())]),
                    );
                    const before = await this.materializeRecordErrors(
                        lease.db,
                        schema.tableName,
                        schema.columns,
                        originalValues,
                    );
                    const merged = new Map(originalValues);
                    for (const change of changes) {
                        merged.set(change.recordId, { ...merged.get(change.recordId), ...change.values });
                    }
                    await this.clearScratchDatabase(lease.db);
                    await lease.db.exec(source.schema);
                    const after = await this.materializeRecordErrors(
                        lease.db,
                        schema.tableName,
                        schema.columns,
                        merged,
                    );
                    // A record newly failing that passed before is blocking
                    // regardless of which id Postgres happens to blame (a
                    // UNIQUE collision is reported against whichever row is
                    // inserted second); a record this batch directly
                    // touches is always blocking, even if it was already
                    // broken, since the caller asked this exact record to
                    // become valid.
                    const blocking = [...after].filter(([id]) => seenIds.has(id) || !before.has(id));
                    if (blocking.length > 0) {
                        throw new McpReadError("validation_failed", "One or more record changes violate the schema", {
                            recordErrors: blocking.map(([recordId, message]) => ({ recordId, message })),
                        });
                    }
                    const priorRevision = this.tableRevision(tableId, displayName, sqlName, source);
                    assertRevision(precondition.expectedRevision, priorRevision, { tableId });
                    if (precondition.dryRun) {
                        return {
                            tableId,
                            applied: false,
                            priorRevision,
                            revision: priorRevision,
                            records: changes.map(change => ({
                                recordId: change.recordId,
                                priorRevision: this.rowRevision(source.data.get(change.recordId)),
                            })),
                        };
                    }
                    source.doc.transact(() => {
                        for (const change of changes) {
                            const record = source.data.get(change.recordId)!;
                            for (const [column, value] of Object.entries(change.values)) {
                                if (column === "id") continue;
                                record.set(column, value);
                            }
                        }
                    }, "mcp-table-records-write");
                    return {
                        tableId,
                        applied: true,
                        priorRevision,
                        revision: this.tableRevision(tableId, displayName, sqlName, source),
                        records: changes.map(change => ({
                            recordId: change.recordId,
                            revision: this.rowRevision(source.data.get(change.recordId)),
                        })),
                    };
                } finally {
                    lease.release();
                    await source.disconnect();
                }
            });
            return { ...result, replayed };
        });
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

    /**
     * Repair a Grid query only after the same executable validation exposed by
     * validate_grid_query succeeds. The final write still goes through
     * setViewQuery, which rechecks the revision immediately before its single
     * Yjs transaction; validation can therefore never overwrite a concurrent
     * collaborator's edit.
     */
    async updateGridQuery(
        uid: string,
        projectId: string,
        gridId: string,
        query: string,
        precondition: MutationPrecondition & { expectedRevision: string; },
    ) {
        const cacheKey = this.idempotency.key(
            "update_grid_query",
            uid,
            projectId,
            gridId,
            precondition.dryRun ? undefined : precondition.operationId,
        );
        const { result, replayed } = await this.idempotency.run(cacheKey, async () => {
            const validation = await this.validateGridQuery(uid, projectId, gridId, query);
            if (!validation.accepted) {
                throw new McpReadError("validation_failed", "Grid query validation failed", {
                    validation,
                });
            }
            const dependencies = new Set<string>(validation.dependencies);
            const dependencyWarnings = (validation.warnings ?? []).filter(warning =>
                dependencies.has(warning.relation)
            );
            if (dependencyWarnings.length > 0) {
                throw new McpReadError(
                    "validation_failed",
                    "Grid query dependencies could not be safely materialized",
                    { validation: { ...validation, warnings: dependencyWarnings } },
                );
            }

            const mutation = await this.setViewQuery(uid, projectId, "grid", gridId, query, {
                expectedRevision: precondition.expectedRevision,
                dryRun: precondition.dryRun,
            });
            return {
                gridId,
                applied: mutation.applied,
                priorRevision: mutation.priorRevision,
                revision: mutation.revision,
                before: { revision: mutation.priorRevision },
                after: { query, revision: mutation.applied ? mutation.revision : mutation.priorRevision },
                validation,
                ordering: {
                    source: validation.inferredOrdering,
                    columns: validation.resultColumns.map(column => column.name),
                    sampleRows: validation.sampleRows,
                    truncated: validation.truncated,
                },
            };
        });
        return { ...result, replayed };
    }

    private async loadRecords(
        db: PGlite,
        relation: string,
        data: Iterable<[string, Y.Map<RelationValue>]>,
    ) {
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
