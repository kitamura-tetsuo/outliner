// Project SQL catalog: shared ENUM types every table of a project can use.
//
// A catalog entry owns exactly one declarative SQL source: a single
// unqualified `CREATE TYPE ... AS ENUM (...)` statement. TYPE definitions
// belong to the Project while Table schemas/records and Grid/Calendar queries
// remain separate (a table's schema never declares a type inline, a query
// never creates one).
//
// The engine materializes the catalog into the project's shared Postgres
// schema before any table of that schema is built
// (`TableSyncAdapter.rebuild`), so a table schema may reference a catalog
// type by its plain name and Postgres resolves it. Validation runs in a
// throwaway PGlite schema exactly like table schemas
// (`schemaIntrospection.parseCreateTable`), so the accepted grammar is what
// Postgres accepts.

import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { enqueueWrite, TableSqlError, toTableSqlError } from "./pgliteService";
import { isValidSqlName, sqlNameError } from "./sqlNames";
import { findTableIdBySqlName, listTables } from "./tableDocs";

const logger = getLogger("sqlCatalog");

/** Project-doc map holding every catalog entry: catalogId -> Y.Map entry. */
export const SQL_CATALOG_REGISTRY_KEY = "sqlCatalog";

export interface SqlCatalogEntry {
    catalogId: string;
    /** Free-text label shown in the Types list. Never appears in SQL. */
    name: string;
    /** The single CREATE TYPE AS ENUM statement this entry owns. */
    source: string;
}

export interface ParsedCatalogType {
    /** The identifier the CREATE TYPE statement declares. */
    typeName: string;
    /** Enum labels in declaration order. */
    labels: string[];
    /** The validated statement (trimmed). */
    createSql: string;
}

/** Structural handles for one catalog entry, including its undo scope. */
export interface CatalogHandles {
    catalogId: string;
    entry: Y.Map<unknown>;
    /** Undo scope covering only this entry's name and source. */
    undo: Y.UndoManager;
}

interface CatalogUndoEntry {
    undo: Y.UndoManager;
    refs: number;
}

const catalogUndoManagers = new WeakMap<Y.Map<unknown>, CatalogUndoEntry>();

/** The catalog registry map in the project doc: catalogId -> Y.Map entry. */
export function getSqlCatalogRegistry(projectDoc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return projectDoc.getMap<Y.Map<unknown>>(SQL_CATALOG_REGISTRY_KEY);
}

export function listCatalogEntries(projectDoc: Y.Doc): SqlCatalogEntry[] {
    const entries: SqlCatalogEntry[] = [];
    getSqlCatalogRegistry(projectDoc).forEach((entry, catalogId) => {
        entries.push({
            catalogId,
            name: String(entry.get("name") ?? ""),
            source: String(entry.get("source") ?? ""),
        });
    });
    return entries;
}

/** Every catalog source of the project, in registry order. */
export function readCatalogSources(projectDoc: Y.Doc | undefined): string[] {
    if (!projectDoc) return [];
    return listCatalogEntries(projectDoc)
        .map((entry) => entry.source)
        .filter((source) => source.trim().length > 0);
}

export function getCatalogSource(projectDoc: Y.Doc, catalogId: string): string | undefined {
    const entry = getSqlCatalogRegistry(projectDoc).get(catalogId);
    if (!entry) return undefined;
    return String(entry.get("source") ?? "");
}

export function getCatalogName(projectDoc: Y.Doc, catalogId: string): string | undefined {
    const entry = getSqlCatalogRegistry(projectDoc).get(catalogId);
    if (!entry) return undefined;
    return String(entry.get("name") ?? "");
}

/**
 * Create a new catalog entry with the given display name and SQL source.
 * All initialization happens in one transaction so observers never see a
 * partially populated entry. Returns the new catalog id.
 */
export function createCatalogEntry(
    projectDoc: Y.Doc,
    name: string,
    source: string,
    options: { catalogId?: string; } = {},
): string {
    const catalogId = options.catalogId ?? uuidv4();
    projectDoc.transact(() => {
        const entry = new Y.Map<unknown>();
        entry.set("name", name);
        entry.set("source", source);
        getSqlCatalogRegistry(projectDoc).set(catalogId, entry);
    });
    return catalogId;
}

/** Replace the SQL source of a catalog entry. No-op when it does not exist. */
export function setCatalogSource(projectDoc: Y.Doc, catalogId: string, source: string): void {
    getSqlCatalogRegistry(projectDoc).get(catalogId)?.set("source", source);
}

/** Rename a catalog entry's display label. No-op when it does not exist. */
export function renameCatalogEntry(projectDoc: Y.Doc, catalogId: string, name: string): void {
    getSqlCatalogRegistry(projectDoc).get(catalogId)?.set("name", name);
}

/** Remove a catalog entry from the registry and dispose its undo manager. */
export function removeCatalogEntry(projectDoc: Y.Doc, catalogId: string): boolean {
    const registry = getSqlCatalogRegistry(projectDoc);
    const entry = registry.get(catalogId);
    if (!entry) return false;
    destroyCatalogUndoManager(entry);
    projectDoc.transact(() => registry.delete(catalogId));
    return true;
}

/** Resolve a catalog type name to the entry that declares it. */
export function findCatalogIdByTypeName(projectDoc: Y.Doc, typeName: string): string | undefined {
    for (const entry of listCatalogEntries(projectDoc)) {
        const declared = tryExtractTypeName(entry.source);
        if (declared === typeName) return entry.catalogId;
    }
    return undefined;
}

/**
 * Check whether `typeName` is already declared by a different catalog entry.
 * Returns a message naming the conflicting entry, or undefined when free.
 */
export function findCatalogTypeConflict(
    projectDoc: Y.Doc,
    catalogId: string,
    typeName: string,
): string | undefined {
    const conflict = listCatalogEntries(projectDoc).find(
        (entry) => entry.catalogId !== catalogId && tryExtractTypeName(entry.source) === typeName,
    );
    if (!conflict) return undefined;
    return `Type "${typeName}" is already declared by "${conflict.name || conflict.catalogId}" `
        + "in this project. Type names must be unique so table schemas can reference them.";
}

/**
 * Validate a catalog type name for the Types editor. Returns a message
 * describing the first problem, or undefined when the name is usable.
 */
export function catalogTypeNameError(
    projectDoc: Y.Doc,
    catalogId: string,
    typeName: string,
): string | undefined {
    const pattern = sqlNameError(typeName);
    if (pattern) return pattern;
    const tableId = findTableIdBySqlName(projectDoc, typeName);
    if (tableId) {
        const table = listTables(projectDoc).find((entry) => entry.tableId === tableId);
        return `Type name "${typeName}" is already used by table "${table?.name || tableId}" `
            + "in this project. Type and table names share one namespace so queries resolve.";
    }
    return findCatalogTypeConflict(projectDoc, catalogId, typeName);
}

export function getCatalogHandles(projectDoc: Y.Doc, catalogId: string): CatalogHandles | undefined {
    const entry = getSqlCatalogRegistry(projectDoc).get(catalogId);
    if (!entry) return undefined;

    let managed = catalogUndoManagers.get(entry);
    if (!managed) {
        const undo = new Y.UndoManager([entry], {
            trackedOrigins: new Set([null]),
        });
        managed = { undo, refs: 0 };
        catalogUndoManagers.set(entry, managed);
        globalUndoRouter.register(undo);
    }

    return { catalogId, entry, undo: managed.undo };
}

/**
 * Claim a reference to a catalog entry's shared UndoManager for a view's
 * lifetime. Call once per mounted consumer (paired with
 * `destroyCatalogUndoManager`).
 */
export function retainCatalogUndoManager(entry: Y.Map<unknown>): void {
    const managed = catalogUndoManagers.get(entry);
    if (managed) managed.refs++;
}

/**
 * Release a view's reference to a catalog entry's UndoManager. The manager is
 * destroyed only when the last referencing view releases it; a call with no
 * outstanding references (e.g. from `removeCatalogEntry`) tears it down
 * immediately so a deleted entry never leaves a manager registered on the
 * global router.
 */
export function destroyCatalogUndoManager(entry: Y.Map<unknown>): void {
    const managed = catalogUndoManagers.get(entry);
    if (!managed) return;
    if (managed.refs > 0) managed.refs--;
    if (managed.refs > 0) return;
    globalUndoRouter.unregister(managed.undo);
    managed.undo.destroy();
    catalogUndoManagers.delete(entry);
}

/**
 * Reject anything that is not a single unqualified CREATE TYPE AS ENUM
 * statement before it ever reaches the engine. Comments and
 * string/identifier literals are stripped first so semicolons and keywords
 * inside them do not count.
 */
export function assertSingleCreateTypeEnum(sql: string): string {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) {
        throw new TableSqlError("schema", "Type definition is empty");
    }
    const stripped = trimmed
        .replace(/--[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""');
    if (!/^\s*create\s+type\b/i.test(stripped)) {
        throw new TableSqlError("schema", "Type definition must be a single CREATE TYPE statement");
    }
    const withoutTrailing = stripped.replace(/;\s*$/, "");
    if (withoutTrailing.includes(";")) {
        throw new TableSqlError("schema", "Type definition must contain exactly one statement");
    }
    if (/^\s*create\s+type\s+[^(\s]+\./i.test(stripped)) {
        throw new TableSqlError("schema", "Schema-qualified type names are not supported");
    }
    if (!/\bas\s+enum\s*\(/i.test(stripped)) {
        throw new TableSqlError(
            "schema",
            "Type definition must be CREATE TYPE <name> AS ENUM (...) — only ENUM types are supported",
        );
    }
    const typeName = extractTypeName(stripped);
    if (!isValidSqlName(typeName)) {
        throw new TableSqlError("schema", sqlNameError(typeName) ?? `Invalid type name "${typeName}"`);
    }
    return trimmed;
}

/** Declared type name of a syntactically valid statement; throws otherwise. */
function extractTypeName(stripped: string): string {
    const match = stripped.match(
        /^\s*create\s+type\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/i,
    );
    const typeName = match?.[1] ?? match?.[2];
    if (!typeName) {
        throw new TableSqlError("schema", "Type definition must declare a type name");
    }
    return typeName;
}

/** Declared type name, or undefined when the source is not a valid statement. */
function tryExtractTypeName(source: string): string | undefined {
    try {
        const stripped = source
            .replace(/--[^\n]*/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/'(?:[^']|'')*'/g, "''")
            .replace(/"(?:[^"]|"")*"/g, '""');
        if (!/^\s*create\s+type\b/i.test(stripped)) return undefined;
        return extractTypeName(stripped);
    } catch {
        return undefined;
    }
}

let validationCounter = 0;

interface PgliteLike {
    query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; }>;
    exec: (sql: string) => Promise<unknown>;
}

/**
 * Validate a CREATE TYPE AS ENUM statement by executing it in a throwaway
 * PGlite schema, then reading the declared labels back from pg_enum. The
 * scratch schema is always dropped, so live project state is never affected.
 */
export async function parseCreateTypeEnum(sql: string): Promise<ParsedCatalogType> {
    const createSql = assertSingleCreateTypeEnum(sql);
    const scratchSchema = `__sqlcatalog_validate_${++validationCounter}__`;

    return enqueueWrite(async (db) => {
        try {
            await db.exec(
                `DROP SCHEMA IF EXISTS "${scratchSchema}" CASCADE;`
                    + `CREATE SCHEMA "${scratchSchema}";`,
            );
            try {
                await db.exec(
                    `BEGIN; SET LOCAL search_path TO "${scratchSchema}"; ${createSql}; COMMIT;`,
                );
            } catch (err) {
                try {
                    await db.exec("ROLLBACK;");
                } catch {
                    // no transaction to roll back
                }
                throw err;
            }
            return await introspectEnumType(db, scratchSchema, createSql);
        } catch (err) {
            throw toTableSqlError("schema", err);
        } finally {
            try {
                await db.exec(`DROP SCHEMA IF EXISTS "${scratchSchema}" CASCADE;`);
            } catch {
                // scratch cleanup is best-effort
            }
        }
    });
}

async function introspectEnumType(
    db: PgliteLike,
    schema: string,
    createSql: string,
): Promise<ParsedCatalogType> {
    const types = await db.query<{ typname: string; }>(
        "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace "
            + "WHERE n.nspname = $1 AND t.typtype = 'e'",
        [schema],
    );
    if (types.rows.length !== 1) {
        throw new TableSqlError(
            "schema",
            "Type definition must declare exactly one ENUM type",
        );
    }
    const typeName = types.rows[0].typname;
    const labels = await db.query<{ enumlabel: string; }>(
        "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
            + "JOIN pg_namespace n ON n.oid = t.typnamespace "
            + "WHERE n.nspname = $1 AND t.typname = $2 ORDER BY e.enumsortorder",
        [schema, typeName],
    );
    if (labels.rows.length === 0) {
        throw new TableSqlError("schema", "ENUM type must declare at least one label");
    }
    return { typeName, labels: labels.rows.map((row) => row.enumlabel), createSql };
}

/**
 * Materialize every valid catalog source into the project's shared schema,
 * creating only the types that do not exist yet. Runs on the caller's
 * database handle inside the caller's write-queue operation — it never
 * enqueues itself, so adapters call it mid-rebuild without deadlocking.
 *
 * An invalid entry is skipped (with a warning) rather than failing the whole
 * catalog: one broken draft must not take down every table of the project.
 * Tables that reference the missing type keep failing with the engine's own
 * "type does not exist" error until the draft is fixed in the Types editor.
 */
export async function ensureCatalogTypes(
    db: PgliteLike,
    pgSchema: string,
    sources: string[],
): Promise<void> {
    for (const source of sources) {
        let createSql: string;
        let typeName: string;
        try {
            createSql = assertSingleCreateTypeEnum(source);
            typeName = extractTypeName(
                createSql
                    .replace(/--[^\n]*/g, "")
                    .replace(/\/\*[\s\S]*?\*\//g, "")
                    .replace(/'(?:[^']|'')*'/g, "''")
                    .replace(/"(?:[^"]|"")*"/g, '""'),
            );
        } catch (err) {
            logger.warn({ err }, "[sqlCatalog] skipping invalid catalog entry");
            continue;
        }
        try {
            const existing = await db.query<{ typname: string; }>(
                "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace "
                    + "WHERE n.nspname = $1 AND t.typname = $2",
                [pgSchema, typeName],
            );
            if (existing.rows.length > 0) continue;
            try {
                await db.exec(
                    `BEGIN; SET LOCAL search_path TO "${pgSchema}"; ${createSql}; COMMIT;`,
                );
            } catch (err) {
                try {
                    await db.exec("ROLLBACK;");
                } catch {
                    // no transaction to roll back
                }
                throw err;
            }
        } catch (err) {
            // A concurrent rebuild may have created the type first, or the
            // draft may fail against live state that validation did not see.
            // Either way the table build below reports the authoritative error.
            logger.warn({ err, typeName }, "[sqlCatalog] catalog type was not materialized");
        }
    }
}
