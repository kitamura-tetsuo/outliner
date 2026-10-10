import type { PGlite } from "@electric-sql/pglite";
import { loadModule, parseSync } from "libpg-query";

import type { SqlCatalogSnapshot } from "./sqlCatalog.js";

await loadModule();

export interface SqlTableRecordSnapshot {
    readonly id: string;
    readonly values: Readonly<Record<string, unknown>>;
}

export interface SqlTableSnapshot {
    readonly id: string;
    readonly schema: string;
    readonly records: readonly Readonly<SqlTableRecordSnapshot>[];
}

export interface SqlInspectionTarget {
    readonly id: string;
    readonly kind: "grid" | "calendar" | "schedule";
    readonly sql: string;
}

export interface SqlEnvironmentInput {
    readonly catalog: SqlCatalogSnapshot;
    readonly tables: readonly Readonly<SqlTableSnapshot>[];
    readonly inspections: readonly Readonly<SqlInspectionTarget>[];
}

export type SqlDiagnosticKind =
    | "catalog"
    | "dependency"
    | "record"
    | "schema"
    | "inspection"
    | "unsupported";

export interface SqlEnvironmentDiagnostic {
    readonly kind: SqlDiagnosticKind;
    readonly message: string;
    readonly objectId?: string;
    readonly recordId?: string;
    readonly column?: string;
}

export interface SqlEnumMetadata {
    readonly objectId: string;
    readonly schema: string;
    readonly name: string;
    readonly identity: string;
    readonly labels: readonly string[];
}

export interface SqlDependencyEvidence {
    readonly referencingId: string;
    readonly sourceKind: "table" | "grid" | "calendar" | "schedule";
    readonly status: "complete" | "incomplete";
    readonly requiredEnums: readonly { readonly objectId: string; readonly identity: string; }[];
    readonly diagnostic?: string;
}

export interface SqlEnvironmentDescriptor {
    readonly projectId: string;
    readonly catalogRevision: string;
    readonly catalogObjectIds: readonly string[];
    readonly tableIds: readonly string[];
    readonly inspectionIds: readonly string[];
}

export interface SqlExecutableEnvironment {
    readonly db: PGlite;
    readonly descriptor: SqlEnvironmentDescriptor;
    readonly enums: readonly SqlEnumMetadata[];
    readonly dependencies: readonly SqlDependencyEvidence[];
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; }>;
    dispose(): Promise<void>;
}

export type SqlEnvironmentResult =
    | { readonly status: "ready"; readonly environment: SqlExecutableEnvironment; }
    | {
        readonly status: "failed";
        readonly descriptor: SqlEnvironmentDescriptor;
        readonly diagnostics: readonly SqlEnvironmentDiagnostic[];
        readonly dependencies: readonly SqlDependencyEvidence[];
    };

export interface SqlEnvironmentLease {
    readonly db: PGlite;
    release(): Promise<void> | void;
}

export interface SqlEnvironmentCompilerOptions {
    /** A lease may reuse an engine; the compiler empties it before and after use. */
    readonly acquire?: () => Promise<SqlEnvironmentLease>;
}

type AstNode = Record<string, unknown>;

function isNode(value: unknown): value is AstNode {
    return typeof value === "object" && value !== null;
}

function quotedIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function descriptorFor(input: SqlEnvironmentInput): SqlEnvironmentDescriptor {
    return Object.freeze({
        projectId: input.catalog.projectId,
        catalogRevision: input.catalog.revision,
        catalogObjectIds: Object.freeze(input.catalog.objects.map(object => object.id)),
        tableIds: Object.freeze(input.tables.map(table => table.id)),
        inspectionIds: Object.freeze(input.inspections.map(target => target.id)),
    });
}

function captureInput(input: Readonly<SqlEnvironmentInput>): SqlEnvironmentInput {
    return Object.freeze({
        catalog: Object.freeze({
            projectId: input.catalog.projectId,
            format: input.catalog.format,
            revision: input.catalog.revision,
            objects: Object.freeze(input.catalog.objects.map(object => Object.freeze({ ...object }))),
        }),
        tables: Object.freeze(input.tables.map(table =>
            Object.freeze({
                id: table.id,
                schema: table.schema,
                records: Object.freeze(table.records.map(record =>
                    Object.freeze({
                        id: record.id,
                        values: Object.freeze({ ...record.values }),
                    })
                )),
            })
        )),
        inspections: Object.freeze(input.inspections.map(target => Object.freeze({ ...target }))),
    });
}

function stringNodes(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const result: string[] = [];
    for (const part of value) {
        if (!isNode(part) || !isNode(part.String) || typeof part.String.sval !== "string") return undefined;
        result.push(part.String.sval);
    }
    return result;
}

function parseOne(sql: string): AstNode {
    const parsed = parseSync(sql) as unknown;
    if (!isNode(parsed) || !Array.isArray(parsed.stmts) || parsed.stmts.length !== 1) {
        throw new Error("SQL must contain exactly one statement");
    }
    const wrapper = parsed.stmts[0];
    if (!isNode(wrapper) || !isNode(wrapper.stmt)) throw new Error("SQL has no statement");
    return wrapper.stmt;
}

function parseEnum(source: string): { name: string; labels: string[]; } {
    const statement = parseOne(source);
    if (Object.keys(statement).length !== 1 || !isNode(statement.CreateEnumStmt)) {
        throw new Error("Catalog enum must be one CREATE TYPE ... AS ENUM declaration");
    }
    const names = stringNodes(statement.CreateEnumStmt.typeName);
    const labels = stringNodes(statement.CreateEnumStmt.vals);
    if (!names || names.length !== 1 || !labels) {
        throw new Error("Catalog enum name must be unqualified");
    }
    return { name: names[0], labels };
}

function collectTypeNames(statement: AstNode): string[][] {
    const names: string[][] = [];
    const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (!isNode(value)) return;
        for (const [key, child] of Object.entries(value)) {
            if (key.toLowerCase() === "typename" && isNode(child)) {
                const parsed = stringNodes(child.names);
                if (parsed) names.push(parsed);
            }
        }
        Object.values(value).forEach(walk);
    };
    walk(statement);
    return names;
}

async function resetDatabase(db: PGlite): Promise<void> {
    try {
        await db.exec("ROLLBACK");
    } catch {
        // There is normally no transaction. ROLLBACK is only recovery for a failed statement.
    }
    // TEMP relations live in session-owned pg_temp_* schemas. Those schemas
    // are intentionally excluded from the ordinary schema-drop loop below,
    // so clear their contents through PostgreSQL's session cleanup command.
    await db.exec("DISCARD TEMP");
    const schemas = await db.query<{ nspname: string; }>(
        "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'",
    );
    for (const { nspname } of schemas.rows) {
        await db.exec(`DROP SCHEMA ${quotedIdentifier(nspname)} CASCADE`);
    }
    await db.exec("CREATE SCHEMA public; SET search_path TO public");
}

async function defaultLease(): Promise<SqlEnvironmentLease> {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite("memory://");
    return { db, release: () => db.close() };
}

function dependencyEvidence(
    input: SqlEnvironmentInput,
    enumsByName: ReadonlyMap<string, { objectId: string; identity: string; }>,
): { evidence: SqlDependencyEvidence[]; diagnostics: SqlEnvironmentDiagnostic[]; } {
    const evidence: SqlDependencyEvidence[] = [];
    const diagnostics: SqlEnvironmentDiagnostic[] = [];
    const sources = [
        ...input.tables.map(table => ({ id: table.id, kind: "table" as const, sql: table.schema })),
        ...input.inspections.map(target => ({ id: target.id, kind: target.kind, sql: target.sql })),
    ];
    for (const source of sources) {
        try {
            const statement = parseOne(source.sql);
            const declarativeInspection = isNode(statement.SelectStmt)
                || isNode(statement.InsertStmt)
                || isNode(statement.UpdateStmt)
                || isNode(statement.DeleteStmt);
            if (source.kind === "table" ? !isNode(statement.CreateStmt) : !declarativeInspection) {
                throw new Error(
                    source.kind === "table"
                        ? "Dependency analysis only supports CREATE TABLE schemas"
                        : "Dependency analysis only supports declarative query and mutation statements",
                );
            }
            const matches = new Map<string, { objectId: string; identity: string; }>();
            for (const parts of collectTypeNames(statement)) {
                const name = parts.length === 1
                    ? parts[0]
                    : parts.length === 2 && parts[0] === "public"
                    ? parts[1]
                    : undefined;
                const match = name ? enumsByName.get(name) : undefined;
                if (match) matches.set(match.objectId, match);
            }
            evidence.push(Object.freeze({
                referencingId: source.id,
                sourceKind: source.kind,
                status: "complete",
                requiredEnums: Object.freeze([...matches.values()]),
            }));
        } catch (error) {
            const diagnostic = `Dependency analysis is incomplete: ${messageOf(error)}`;
            evidence.push(Object.freeze({
                referencingId: source.id,
                sourceKind: source.kind,
                status: "incomplete",
                requiredEnums: Object.freeze([]),
                diagnostic,
            }));
            diagnostics.push({ kind: "dependency", objectId: source.id, message: diagnostic });
        }
    }
    return { evidence, diagnostics };
}

async function enumMetadata(
    db: PGlite,
    objectByName: ReadonlyMap<string, string>,
): Promise<SqlEnumMetadata[]> {
    const result = await db.query<{ schema: string; name: string; label: string; }>(
        "SELECT n.nspname AS schema, t.typname AS name, e.enumlabel AS label "
            + "FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace "
            + "JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' "
            + "ORDER BY t.oid, e.enumsortorder",
    );
    const grouped = new Map<string, SqlEnumMetadata>();
    for (const row of result.rows) {
        const objectId = objectByName.get(row.name);
        if (!objectId) continue;
        const current = grouped.get(row.name);
        if (current) (current.labels as string[]).push(row.label);
        else {
            grouped.set(row.name, {
                objectId,
                schema: row.schema,
                name: row.name,
                identity: `${quotedIdentifier(row.schema)}.${quotedIdentifier(row.name)}`,
                labels: [row.label],
            });
        }
    }
    return [...grouped.values()].map(value => Object.freeze({ ...value, labels: Object.freeze(value.labels) }));
}

async function validateColumnTypes(
    db: PGlite,
    tableId: string,
    tableName: string,
): Promise<SqlEnvironmentDiagnostic[]> {
    const columns = await db.query<{
        column_name: string;
        typtype: string;
        typcategory: string;
        element_typtype: string | null;
    }>(
        "SELECT a.attname AS column_name, t.typtype, t.typcategory, et.typtype AS element_typtype "
            + "FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid "
            + "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid "
            + "LEFT JOIN pg_type et ON et.oid=t.typelem "
            + "WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped",
        [tableName],
    );
    return columns.rows.flatMap(column => {
        const unsupported = column.typcategory === "A" && column.element_typtype === "e"
            ? "ENUM array"
            : column.typtype === "c"
            ? "composite"
            : column.typtype === "d"
            ? "domain"
            : column.typtype === "r" || column.typtype === "m"
            ? "range"
            : undefined;
        return unsupported
            ? [{
                kind: "unsupported" as const,
                objectId: tableId,
                column: column.column_name,
                message: `${unsupported} columns are not supported`,
            }]
            : [];
    });
}

async function insertRecords(
    db: PGlite,
    table: SqlTableSnapshot,
    tableName: string,
): Promise<SqlEnvironmentDiagnostic[]> {
    const diagnostics: SqlEnvironmentDiagnostic[] = [];
    const columnTypes = await db.query<{ column_name: string; type_identity: string; }>(
        "SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type_identity "
            + "FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace "
            + "WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped",
        [tableName],
    );
    const typeByColumn = new Map(columnTypes.rows.map(row => [row.column_name, row.type_identity]));
    for (const record of table.records) {
        const columns = Object.keys(record.values);
        const values = columns.map(column => record.values[column]);
        const sql = columns.length === 0
            ? `INSERT INTO ${quotedIdentifier(tableName)} DEFAULT VALUES`
            : `INSERT INTO ${quotedIdentifier(tableName)} (${columns.map(quotedIdentifier).join(",")}) VALUES (${
                columns.map((_, index) => `$${index + 1}`).join(",")
            })`;
        try {
            await db.query(sql, values);
        } catch (error) {
            const text = messageOf(error);
            let column: string | undefined;
            // Ask PostgreSQL to validate every supplied value against its
            // actual declared type. Error-message substring matching cannot
            // safely attribute a failure (for example, "invalid" contains
            // the common column name "id").
            for (let index = 0; index < columns.length; index++) {
                const type = typeByColumn.get(columns[index]);
                if (!type) continue;
                try {
                    await db.query(`SELECT $1::${type}`, [values[index]]);
                } catch {
                    column = columns[index];
                    break;
                }
            }
            // Constraint errors may not be reproducible by a scalar cast.
            // Only accept an exact quoted column name emitted by PostgreSQL.
            if (!column) {
                const namedColumn = /column\s+"([^"]+)"/i.exec(text)?.[1];
                if (namedColumn && typeByColumn.has(namedColumn)) column = namedColumn;
            }
            diagnostics.push({
                kind: "record",
                objectId: table.id,
                recordId: record.id,
                column,
                message: text,
            });
        }
    }
    return diagnostics;
}

/**
 * Build a disposable, project-isolated SQL environment exclusively from the
 * supplied immutable snapshots. No Yjs document or live materialization is read.
 */
export async function compileSqlEnvironment(
    input: Readonly<SqlEnvironmentInput>,
    options: SqlEnvironmentCompilerOptions = {},
): Promise<SqlEnvironmentResult> {
    // Capture every scalar before the first asynchronous engine operation. A
    // caller mutating its own objects in-flight cannot alter this candidate.
    const captured = captureInput(input);
    const descriptor = descriptorFor(captured);
    const diagnostics: SqlEnvironmentDiagnostic[] = [];
    const enumDeclarations: { objectId: string; name: string; source: string; }[] = [];
    const objectByName = new Map<string, string>();

    for (const object of captured.catalog.objects) {
        if (object.kind !== "enum") {
            diagnostics.push({
                kind: "unsupported",
                objectId: object.id,
                message: `Unsupported catalog kind: ${object.kind}`,
            });
            continue;
        }
        try {
            const declaration = parseEnum(object.source);
            if (objectByName.has(declaration.name)) {
                diagnostics.push({
                    kind: "catalog",
                    objectId: object.id,
                    message: `Duplicate catalog SQL name: ${declaration.name}`,
                });
            } else {
                objectByName.set(declaration.name, object.id);
                enumDeclarations.push({ objectId: object.id, name: declaration.name, source: object.source });
            }
        } catch (error) {
            diagnostics.push({ kind: "catalog", objectId: object.id, message: messageOf(error) });
        }
    }
    const enumIdentities = new Map([...objectByName].map(([name, objectId]) => [
        name,
        { objectId, identity: `"public".${quotedIdentifier(name)}` },
    ]));
    const dependencies = dependencyEvidence(captured, enumIdentities);
    diagnostics.push(...dependencies.diagnostics);
    if (diagnostics.length > 0) {
        return {
            status: "failed",
            descriptor,
            diagnostics: Object.freeze(diagnostics),
            dependencies: Object.freeze(dependencies.evidence),
        };
    }

    const lease = await (options.acquire ?? defaultLease)();
    const { db } = lease;
    let handedOff = false;
    try {
        await resetDatabase(db);
        for (const declaration of enumDeclarations) {
            try {
                const conflict = await db.query<{ exists: boolean; }>(
                    "SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace "
                        + "WHERE t.typname=$1 AND n.nspname IN ('pg_catalog','information_schema')) AS exists",
                    [declaration.name],
                );
                if (conflict.rows[0]?.exists) {
                    throw new Error(`Catalog name conflicts with a built-in type: ${declaration.name}`);
                }
                await db.exec(declaration.source);
            } catch (error) {
                diagnostics.push({ kind: "catalog", objectId: declaration.objectId, message: messageOf(error) });
            }
        }

        for (const table of captured.tables) {
            let tableName: string | undefined;
            try {
                const statement = parseOne(table.schema);
                const create = statement.CreateStmt;
                if (!isNode(create) || !isNode(create.relation) || typeof create.relation.relname !== "string") {
                    throw new Error("Table schema must be one CREATE TABLE statement");
                }
                if (create.relation.schemaname !== undefined) {
                    throw new Error("Schema-qualified tables are not supported");
                }
                if (create.relation.relpersistence === "t") {
                    throw new Error("Temporary tables are not supported");
                }
                tableName = create.relation.relname;
                await db.exec(table.schema);
                diagnostics.push(...await validateColumnTypes(db, table.id, tableName));
                if (!diagnostics.some(diagnostic => diagnostic.objectId === table.id)) {
                    diagnostics.push(...await insertRecords(db, table, tableName));
                }
            } catch (error) {
                diagnostics.push({ kind: "schema", objectId: table.id, message: messageOf(error) });
            }
        }

        for (const target of captured.inspections) {
            try {
                await db.query(`EXPLAIN ${target.sql}`);
            } catch (error) {
                diagnostics.push({ kind: "inspection", objectId: target.id, message: messageOf(error) });
            }
        }

        if (diagnostics.length > 0) {
            return {
                status: "failed",
                descriptor,
                diagnostics: Object.freeze(diagnostics),
                dependencies: Object.freeze(dependencies.evidence),
            };
        }
        const enums = await enumMetadata(db, objectByName);
        if (enums.length !== enumDeclarations.length) {
            diagnostics.push({
                kind: "catalog",
                message: "Not every declared ENUM was found in the executable catalog",
            });
            return {
                status: "failed",
                descriptor,
                diagnostics: Object.freeze(diagnostics),
                dependencies: Object.freeze(dependencies.evidence),
            };
        }
        handedOff = true;
        let disposed = false;
        const environment: SqlExecutableEnvironment = Object.freeze({
            db,
            descriptor,
            enums: Object.freeze(enums),
            dependencies: Object.freeze(dependencies.evidence),
            query: <T>(sql: string, params?: unknown[]) => db.query<T>(sql, params),
            dispose: async () => {
                if (disposed) return;
                disposed = true;
                try {
                    await resetDatabase(db);
                } finally {
                    await lease.release();
                }
            },
        });
        return { status: "ready", environment };
    } catch (error) {
        diagnostics.push({ kind: "catalog", message: messageOf(error) });
        return {
            status: "failed",
            descriptor,
            diagnostics: Object.freeze(diagnostics),
            dependencies: Object.freeze(dependencies.evidence),
        };
    } finally {
        if (!handedOff) {
            try {
                await resetDatabase(db);
            } finally {
                await lease.release();
            }
        }
    }
}
