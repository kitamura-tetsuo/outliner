// Project-level SQL catalog for TYPE sources (issue #5574).
//
// A Project owns its TYPE definitions; Table schemas/records (tableDocs) and
// Grid SELECT editors (gridDocs) are separate entities with their own
// registries and must never read or write this catalog's state. This module
// is the single home for catalog parsing, comparison, storage and transport:
//
//   * parsing: exactly one unqualified `CREATE TYPE <name> AS ENUM (...)`
//     declaration per object, with exact labels in declaration order;
//   * comparison: declaration-order SQL comparison over exact labels;
//   * storage: a dedicated `projectSqlCatalog` Y.Map on the project doc,
//     disjoint from the Table (`yjsTables`) and Grid registries;
//   * transport: every mutation funnels through `SqlCatalogService`, which
//     requires an authenticated write grant. Components must call the service;
//     nothing here accepts a client-declared UID or authorization, and direct
//     Yjs publication bypasses the grant check by construction, so reviewers
//     should treat any new direct writer to the catalog key as a defect.
//
// Only the ENUM kind is executable. Any other DDL classifies as UNSUPPORTED
// and is reported as such; it is never presented as working functionality.

import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";

/** Y.Map key on the project doc holding the catalog (id -> entry map). */
export const SQL_CATALOG_REGISTRY_KEY = "projectSqlCatalog";

const ENTRY_SOURCE_KEY = "source";
const ENTRY_KIND_KEY = "kind";
const ENTRY_NAME_KEY = "name";
const ENTRY_LABELS_KEY = "labels";

/** The only executable catalog kind. */
export type SqlCatalogKind = "ENUM";

/** A persisted TYPE declaration identity. */
export interface SqlCatalogDeclaration {
    /** Stable catalog identity, independent of the SQL name. */
    id: string;
    kind: SqlCatalogKind;
    /** Resolved type name taken from the declaration itself. */
    name: string;
    /** The authored source text (single CREATE TYPE AS ENUM declaration). */
    source: string;
    /** Exact ENUM labels in declaration order. */
    labels: string[];
}

/** Authorization resolved by the caller for one catalog operation. */
export interface SqlCatalogAuth {
    /** Authenticated user id. Absent for anonymous visitors. */
    userId?: string;
    /** Whether the user holds a write grant on this project. */
    hasWriteGrant: boolean;
    projectId: string;
}

/** Result of classifying arbitrary source text. */
export type SqlCatalogClassification =
    | { kind: "ENUM"; name: string; labels: string[]; source: string; }
    | { kind: "UNSUPPORTED"; reason: string; };

/** Error for malformed or unsupported TYPE source. */
export class SqlCatalogError extends Error {
    readonly code: "empty" | "syntax" | "unsupported";
    constructor(code: "empty" | "syntax" | "unsupported", message: string) {
        super(message);
        this.name = "SqlCatalogError";
        this.code = code;
    }
}

/** Error for refused catalog mutations (missing or denied grants). */
export class SqlCatalogAuthError extends Error {
    readonly code: "missing-grant" | "denied";
    constructor(code: "missing-grant" | "denied", message: string) {
        super(message);
        this.name = "SqlCatalogAuthError";
        this.code = code;
    }
}

const SQL_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;
const MAX_SQL_NAME_LENGTH = 63;

/** Split off string literals so structural scanning ignores their contents. */
function maskLiterals(sql: string): string {
    return sql
        .replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
        .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
        .replace(/'(?:[^']|'')*'/g, (m) => " ".repeat(m.length))
        .replace(/"(?:[^"]|"")*"/g, (m) => " ".repeat(m.length));
}

/** True when the masked text holds more than one statement. */
function hasMultipleStatements(masked: string): boolean {
    const withoutTrailing = masked.replace(/;\s*$/, "");
    return withoutTrailing.includes(";");
}

/** Extract single-quoted labels from the ENUM parenthesized list. */
function parseEnumLabels(listSql: string): string[] {
    const labels: string[] = [];
    const literalRe = /'((?:[^']|'')*)'/g;
    let m: RegExpExecArray | null;
    while ((m = literalRe.exec(listSql)) !== null) {
        labels.push(m[1].replace(/''/g, "'"));
    }
    return labels;
}

/**
 * Parse one unqualified `CREATE TYPE <name> AS ENUM (...)` declaration.
 * Throws SqlCatalogError for empty input, multi-statement input, qualified
 * names, invalid names, or a missing/empty label list.
 */
export function parseEnumDeclaration(sql: string): { name: string; labels: string[]; source: string; } {
    const source = (sql ?? "").trim();
    if (!source) {
        throw new SqlCatalogError("empty", "TYPE source is empty");
    }
    // The mask is length-preserving (every stripped character becomes a
    // space), so indices into the masked text slice the original exactly.
    // Structure matches on the mask; names and labels are read back from the
    // original so literal contents survive.
    const masked = maskLiterals(source);
    if (hasMultipleStatements(masked)) {
        throw new SqlCatalogError("syntax", "TYPE source must contain exactly one declaration");
    }
    const match = masked.match(
        /^\s*create\s+type\s+(.+?)\s+as\s+enum\s*\(([\s\S]*)\)\s*;?\s*$/id,
    );
    if (!match || !match.indices) {
        throw new SqlCatalogError(
            "syntax",
            "TYPE source must be a single CREATE TYPE <name> AS ENUM (...) declaration",
        );
    }
    const nameIndices = match.indices[1];
    const labelsIndices = match.indices[2];
    if (!nameIndices || !labelsIndices) {
        throw new SqlCatalogError(
            "syntax",
            "TYPE source must be a single CREATE TYPE <name> AS ENUM (...) declaration",
        );
    }
    const rawName = source.slice(nameIndices[0], nameIndices[1]).trim().replace(/^"(.*)"$/, "$1");
    if (!rawName || rawName.includes(".")) {
        throw new SqlCatalogError("syntax", "TYPE name must be a single unqualified identifier");
    }
    if (rawName.length > MAX_SQL_NAME_LENGTH || !SQL_NAME_PATTERN.test(rawName)) {
        throw new SqlCatalogError(
            "syntax",
            `TYPE name "${rawName}" must be lower case and contain only letters, digits and underscores`,
        );
    }
    const labels = parseEnumLabels(source.slice(labelsIndices[0], labelsIndices[1]));
    if (labels.length === 0) {
        throw new SqlCatalogError("syntax", "ENUM declaration must list at least one label");
    }
    if (new Set(labels).size !== labels.length) {
        throw new SqlCatalogError("syntax", "ENUM labels must be unique");
    }
    return { name: rawName, labels, source };
}

/**
 * Classify arbitrary source text. ENUM declarations classify as executable;
 * every other DDL (CREATE TABLE, CREATE VIEW, SELECT, ...) classifies as
 * UNSUPPORTED with a human-readable reason, never as working functionality.
 */
export function classifySource(sql: string): SqlCatalogClassification {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) {
        return { kind: "UNSUPPORTED", reason: "TYPE source is empty" };
    }
    const masked = maskLiterals(trimmed);
    if (!/^\s*create\s+type\b/i.test(masked)) {
        return {
            kind: "UNSUPPORTED",
            reason: "Unsupported DDL: only CREATE TYPE AS ENUM is executable in the Project SQL catalog",
        };
    }
    if (!/\bas\s+enum\b/i.test(masked)) {
        return {
            kind: "UNSUPPORTED",
            reason: "Unsupported TYPE: only CREATE TYPE AS ENUM is executable; other TYPE variants are not supported",
        };
    }
    try {
        const parsed = parseEnumDeclaration(trimmed);
        return { kind: "ENUM", ...parsed };
    } catch (err) {
        if (err instanceof SqlCatalogError) {
            return { kind: "UNSUPPORTED", reason: err.message };
        }
        throw err;
    }
}

/**
 * Declaration-order SQL comparison: two ENUM sources describe the same type
 * exactly when their resolved names match and their labels match exactly, in
 * order. Case, whitespace and quoting differences outside the labels never
 * make two declarations equal when the labels differ.
 */
export function declarationsEqual(aSource: string, bSource: string): boolean {
    let a: { name: string; labels: string[]; };
    let b: { name: string; labels: string[]; };
    try {
        a = parseEnumDeclaration(aSource);
        b = parseEnumDeclaration(bSource);
    } catch {
        return false;
    }
    if (a.name !== b.name || a.labels.length !== b.labels.length) return false;
    return a.labels.every((label, i) => label === b.labels[i]);
}

/** The catalog registry map on the project doc. */
export function getCatalogRegistry(projectDoc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return projectDoc.getMap<Y.Map<unknown>>(SQL_CATALOG_REGISTRY_KEY);
}

function readEntry(id: string, entry: Y.Map<unknown>): SqlCatalogDeclaration {
    const source = String(entry.get(ENTRY_SOURCE_KEY) ?? "");
    const parsed = parseEnumDeclaration(source);
    return { id, kind: "ENUM", name: parsed.name, source, labels: parsed.labels };
}

/** List every persisted declaration identity, kind and resolved name. */
export function listCatalogDeclarations(projectDoc: Y.Doc): SqlCatalogDeclaration[] {
    const out: SqlCatalogDeclaration[] = [];
    getCatalogRegistry(projectDoc).forEach((entry, id) => {
        try {
            out.push(readEntry(id, entry));
        } catch {
            // A foreign writer stored non-ENUM bytes under our key; the
            // catalog never presents them as working declarations.
        }
    });
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
}

/** Read one persisted declaration by identity. */
export function getCatalogDeclaration(
    projectDoc: Y.Doc,
    id: string,
): SqlCatalogDeclaration | undefined {
    const entry = getCatalogRegistry(projectDoc).get(id);
    if (!entry) return undefined;
    try {
        return readEntry(id, entry);
    } catch {
        return undefined;
    }
}

function writeEntry(projectDoc: Y.Doc, id: string, source: string, parsed: { name: string; labels: string[]; }): void {
    projectDoc.transact(() => {
        const entry = new Y.Map<unknown>();
        entry.set(ENTRY_KIND_KEY, "ENUM");
        entry.set(ENTRY_NAME_KEY, parsed.name);
        entry.set(ENTRY_SOURCE_KEY, source);
        const labels = new Y.Array<string>();
        labels.push(parsed.labels);
        entry.set(ENTRY_LABELS_KEY, labels);
        getCatalogRegistry(projectDoc).set(id, entry);
    });
}

/** Name clash with another declaration of the catalog, if any. */
function findNameConflict(projectDoc: Y.Doc, name: string, exceptId?: string): string | undefined {
    const clash = listCatalogDeclarations(projectDoc).find(
        (d) => d.id !== exceptId && d.name === name,
    );
    if (!clash) return undefined;
    return `TYPE name "${name}" is already declared in this project's catalog. TYPE names must be unique so queries can reference them.`;
}

export interface SqlCatalogServiceOptions {
    projectId: string;
    /** Resolve the caller's current authorization (wired to UserManager in UI). */
    resolveAuth: () => SqlCatalogAuth;
}

/**
 * Authenticated browser-to-catalog transport over the project doc. Every
 * mutation resolves the caller's grant first and refuses missing (`!userId`)
 * or denied (`!hasWriteGrant`) callers before touching Yjs; reads stay open
 * so the declaration list remains discoverable.
 */
export class SqlCatalogService {
    private readonly projectDoc: Y.Doc;
    private readonly projectId: string;
    private readonly resolveAuth: () => SqlCatalogAuth;

    constructor(projectDoc: Y.Doc, options: SqlCatalogServiceOptions) {
        this.projectDoc = projectDoc;
        this.projectId = options.projectId;
        this.resolveAuth = options.resolveAuth;
    }

    private requireWriteGrant(operation: string): SqlCatalogAuth {
        const auth = this.resolveAuth();
        if (!auth.userId) {
            throw new SqlCatalogAuthError(
                "missing-grant",
                `Cannot ${operation} TYPE declaration without signing in to project "${this.projectId}"`,
            );
        }
        if (!auth.hasWriteGrant) {
            throw new SqlCatalogAuthError(
                "denied",
                `Write access to project "${this.projectId}" is required to ${operation} TYPE declarations`,
            );
        }
        return auth;
    }

    list(): SqlCatalogDeclaration[] {
        return listCatalogDeclarations(this.projectDoc);
    }

    get(id: string): SqlCatalogDeclaration | undefined {
        return getCatalogDeclaration(this.projectDoc, id);
    }

    /** Create one ENUM declaration from source; other DDL is refused as unsupported. */
    create(source: string): SqlCatalogDeclaration {
        this.requireWriteGrant("create");
        const classified = classifySource(source);
        if (classified.kind !== "ENUM") {
            throw new SqlCatalogError("unsupported", classified.reason);
        }
        const conflict = findNameConflict(this.projectDoc, classified.name);
        if (conflict) throw new SqlCatalogError("syntax", conflict);
        const id = uuidv4();
        writeEntry(this.projectDoc, id, classified.source, classified);
        const created = getCatalogDeclaration(this.projectDoc, id);
        if (!created) throw new SqlCatalogError("syntax", "Failed to persist TYPE declaration");
        return created;
    }

    /** Replace the source of one declaration; other DDL is refused as unsupported. */
    update(id: string, source: string): SqlCatalogDeclaration {
        this.requireWriteGrant("edit");
        if (!getCatalogRegistry(this.projectDoc).get(id)) {
            throw new SqlCatalogError("syntax", "TYPE declaration does not exist");
        }
        const classified = classifySource(source);
        if (classified.kind !== "ENUM") {
            throw new SqlCatalogError("unsupported", classified.reason);
        }
        const conflict = findNameConflict(this.projectDoc, classified.name, id);
        if (conflict) throw new SqlCatalogError("syntax", conflict);
        writeEntry(this.projectDoc, id, classified.source, classified);
        const updated = getCatalogDeclaration(this.projectDoc, id);
        if (!updated) throw new SqlCatalogError("syntax", "Failed to persist TYPE declaration");
        return updated;
    }

    /** Delete one declaration by identity. Returns false when absent. */
    remove(id: string): boolean {
        this.requireWriteGrant("delete");
        const registry = getCatalogRegistry(this.projectDoc);
        if (!registry.get(id)) return false;
        this.projectDoc.transact(() => {
            registry.delete(id);
        });
        return true;
    }
}

/** Create the catalog service for one project doc. */
export function createSqlCatalogService(
    projectDoc: Y.Doc,
    options: SqlCatalogServiceOptions,
): SqlCatalogService {
    return new SqlCatalogService(projectDoc, options);
}
