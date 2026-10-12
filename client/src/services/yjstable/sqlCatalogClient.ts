import { userManager } from "../../auth/UserManager";
import { resolveApiBaseUrl } from "../../lib/yjsApiUrl";

export interface SqlCatalogObjectDto {
    readonly id: string;
    readonly kind: string;
    readonly source: string;
}

export interface SqlCatalogSnapshotDto {
    readonly projectId: string;
    readonly format: number;
    readonly objects: readonly SqlCatalogObjectDto[];
    readonly revision: string;
}

export type SqlCatalogMutationIntentDto =
    | { readonly operation: "create"; readonly object: SqlCatalogObjectDto; }
    | { readonly operation: "replace"; readonly object: SqlCatalogObjectDto; }
    | { readonly operation: "delete"; readonly objectId: string; };

export interface SqlCatalogMutationDto {
    readonly expectedRevision: string;
    readonly intent: SqlCatalogMutationIntentDto;
}

export class SqlCatalogTransportError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: string,
    ) {
        super(message);
        this.name = "SqlCatalogTransportError";
    }
}

export interface SqlCatalogTransportDeps {
    readonly baseUrl?: string;
    readonly getToken?: () => Promise<string | undefined>;
}

async function defaultToken(): Promise<string | undefined> {
    const user = userManager.getCurrentUser();
    if (!user || !userManager.auth.currentUser) return undefined;
    return await userManager.auth.currentUser.getIdToken();
}

function endpoint(baseUrl: string, path: string): string {
    return baseUrl.endsWith("/") ? `${baseUrl}${path.slice(1)}` : `${baseUrl}${path}`;
}

async function request<T>(
    path: string,
    init: { readonly method: string; readonly body?: string; },
    deps?: SqlCatalogTransportDeps,
): Promise<T> {
    const baseUrl = deps?.baseUrl ?? resolveApiBaseUrl();
    const token = await (deps?.getToken ? deps.getToken() : defaultToken());
    if (!token) throw new SqlCatalogTransportError("Not authenticated", 401, "unauthorized");
    const response = await fetch(endpoint(baseUrl, path), {
        method: init.method,
        body: init.body,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
    });
    let body: { error?: string; code?: string; snapshot?: T; result?: T; } = {};
    try {
        body = await response.json() as typeof body;
    } catch {
        // A non-JSON answer carries no contract payload; fall through to status handling.
    }
    if (!response.ok) {
        throw new SqlCatalogTransportError(body.error ?? response.statusText, response.status, body.code);
    }
    const payload = path.includes("/read") ? body.snapshot as T | undefined : body.result as T | undefined;
    if (payload === undefined) {
        throw new SqlCatalogTransportError("Catalog service returned no payload", response.status);
    }
    return payload;
}

/**
 * Authenticated browser-to-catalog-service transport (issue #5574). Every
 * catalog read and mutation travels the server router, which authenticates
 * the Firebase ID token and reuses the revision-bound
 * SqlCatalogMutationService. Callers never accept a client-declared UID and
 * never publish catalog Yjs updates directly.
 */
export async function fetchCatalogSnapshot(
    projectId: string,
    deps?: SqlCatalogTransportDeps,
): Promise<SqlCatalogSnapshotDto> {
    return await request<SqlCatalogSnapshotDto>(
        `/api/sql-catalog/read?projectId=${encodeURIComponent(projectId)}`,
        { method: "GET" },
        deps,
    );
}

export async function validateCatalogMutation(
    projectId: string,
    mutation: SqlCatalogMutationDto,
    deps?: SqlCatalogTransportDeps,
): Promise<unknown> {
    return await request<unknown>("/api/sql-catalog/validate", {
        method: "POST",
        body: JSON.stringify({ projectId, ...mutation }),
    }, deps);
}

export async function applyCatalogMutation(
    projectId: string,
    mutation: SqlCatalogMutationDto,
    deps?: SqlCatalogTransportDeps,
): Promise<unknown> {
    return await request<unknown>("/api/sql-catalog/apply", {
        method: "POST",
        body: JSON.stringify({ projectId, ...mutation }),
    }, deps);
}

/** Skip whitespace and SQL comments (double-dash lines and slash-star blocks). */
function skipTrivia(source: string, position: number): number {
    let cursor = position;
    for (;;) {
        const char = source[cursor];
        if (char === undefined) return cursor;
        if (/\s/.test(char)) {
            cursor += 1;
            continue;
        }
        if (source.startsWith("--", cursor)) {
            const newline = source.indexOf("\n", cursor + 2);
            cursor = newline === -1 ? source.length : newline + 1;
            continue;
        }
        if (source.startsWith("/*", cursor)) {
            const close = source.indexOf("*/", cursor + 2);
            cursor = close === -1 ? source.length : close + 2;
            continue;
        }
        return cursor;
    }
}

/** Match a keyword case-insensitively at `position` (after trivia), with a word boundary. */
function matchKeyword(source: string, position: number, keyword: string): number | undefined {
    const cursor = skipTrivia(source, position);
    const word = source.slice(cursor, cursor + keyword.length);
    if (word.toLowerCase() !== keyword) return undefined;
    const next = source[cursor + keyword.length];
    if (next !== undefined && /[\p{L}\p{N}_$]/u.test(next)) return undefined;
    return cursor + keyword.length;
}

/**
 * Parse one SQL identifier at `position` (after trivia). Returns the resolved
 * name — quoted identifiers unescaped with case preserved, unquoted
 * identifiers folded to lowercase per PostgreSQL rules — and the end cursor.
 */
function parseIdentifier(source: string, position: number): { name: string; end: number; } | undefined {
    const cursor = skipTrivia(source, position);
    const char = source[cursor];
    if (char === '"') {
        let name = "";
        let index = cursor + 1;
        for (;;) {
            const close = source.indexOf('"', index);
            if (close === -1) return undefined;
            if (source[close + 1] === '"') {
                name += source.slice(index, close + 1);
                index = close + 2;
                continue;
            }
            name += source.slice(index, close);
            return { name, end: close + 1 };
        }
    }
    // PostgreSQL unquoted identifiers may start with any letter — including
    // non-Latin letters — or an underscore, followed by letters, digits,
    // underscores or dollar signs. The ASCII-only class rejected valid
    // persisted names such as unquoted Japanese identifiers.
    const match = /^[\p{L}_][\p{L}\p{N}_$]*/u.exec(source.slice(cursor));
    if (!match) return undefined;
    return { name: match[0].toLowerCase(), end: cursor + match[0].length };
}

/**
 * True when `source` holds exactly one statement: after the first top-level
 * semicolon only whitespace and comments may follow. String literals, quoted
 * identifiers and comments never contribute a statement boundary.
 */
function isSingleStatementTail(rest: string): boolean {
    let index = 0;
    while (index < rest.length) {
        const char = rest[index];
        if (char === "'") {
            const match = /'(?:[^']|'')*'/.exec(rest.slice(index));
            if (!match) return true;
            index += match[0].length;
            continue;
        }
        if (char === '"') {
            const match = /"(?:[^"]|"")*"/.exec(rest.slice(index));
            if (!match) return true;
            index += match[0].length;
            continue;
        }
        if (rest.startsWith("--", index)) {
            const newline = rest.indexOf("\n", index + 2);
            index = newline === -1 ? rest.length : newline + 1;
            continue;
        }
        if (rest.startsWith("/*", index)) {
            const close = rest.indexOf("*/", index + 2);
            index = close === -1 ? rest.length : close + 2;
            continue;
        }
        if (char === ";") {
            return skipTrivia(rest, index + 1) >= rest.length;
        }
        index += 1;
    }
    return true;
}

/**
 * Resolve the SQL type name of one catalog source for display. Returns the
 * unqualified name only for a single unqualified CREATE TYPE AS ENUM
 * declaration — the same shape the catalog compiler accepts, resolved the
 * same way (leading/trailing comments allowed, unquoted identifiers folded
 * to lowercase, quoted identifiers unescaped); every other source (qualified
 * names, multiple statements, non-ENUM DDL) resolves to undefined so the
 * surface reports it as unsupported instead of presenting it as working
 * functionality.
 */
export function resolveCatalogTypeName(source: string): string | undefined {
    let cursor = matchKeyword(source, 0, "create");
    if (cursor === undefined) return undefined;
    cursor = matchKeyword(source, cursor, "type");
    if (cursor === undefined) return undefined;
    const identifier = parseIdentifier(source, cursor);
    if (!identifier) return undefined;
    // A dot after the first identifier is a qualified (schema-bound) name.
    if (source[skipTrivia(source, identifier.end)] === ".") {
        return undefined;
    }
    cursor = matchKeyword(source, identifier.end, "as");
    if (cursor === undefined) return undefined;
    cursor = matchKeyword(source, cursor, "enum");
    if (cursor === undefined) return undefined;
    const paren = skipTrivia(source, cursor);
    if (source[paren] !== "(") return undefined;
    if (!isSingleStatementTail(source.slice(paren + 1))) return undefined;
    return identifier.name;
}

/** True only for the one executable shape: a single unqualified CREATE TYPE AS ENUM. */
export function isExecutableEnumSource(source: string): boolean {
    return resolveCatalogTypeName(source) !== undefined;
}

/** Display label for a stored kind. Only "enum" is executable (REQ-004). */
export function catalogKindLabel(kind: string): string {
    return kind === "enum" ? "ENUM" : `Unsupported (${kind})`;
}
