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

const TYPE_NAME_PATTERN = /^\s*(?:--[^\n]*\n|\s)*create\s+type\s+(?:"([^"]+)"|([A-Za-z_][\w$]*))\s+as\s+enum\s*\(/i;

/**
 * Resolve the SQL type name of one catalog source for display. Returns the
 * unqualified name only for a single unqualified CREATE TYPE AS ENUM
 * declaration; every other source (qualified names, multiple statements,
 * non-ENUM DDL) resolves to undefined so the surface reports it as
 * unsupported instead of presenting it as working functionality.
 */
export function resolveCatalogTypeName(source: string): string | undefined {
    const match = TYPE_NAME_PATTERN.exec(source);
    if (!match) return undefined;
    const name = match[1] ?? match[2];
    const rest = source.slice(match[0].length);
    // A second statement after the ENUM declaration is not the supported shape.
    const withoutStrings = rest.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, "");
    if (withoutStrings.includes(";")) {
        const tail = withoutStrings.slice(withoutStrings.indexOf(";") + 1);
        if (/[^\s]/.test(tail)) return undefined;
    }
    return name;
}

/** True only for the one executable shape: a single unqualified CREATE TYPE AS ENUM. */
export function isExecutableEnumSource(source: string): boolean {
    if (resolveCatalogTypeName(source) === undefined) return false;
    return /as\s+enum\s*\(/i.test(source);
}

/** Display label for a stored kind. Only "enum" is executable (REQ-004). */
export function catalogKindLabel(kind: string): string {
    return kind === "enum" ? "ENUM" : `Unsupported (${kind})`;
}
