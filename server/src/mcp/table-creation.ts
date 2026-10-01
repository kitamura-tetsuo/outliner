import type { PGlite } from "@electric-sql/pglite";
import type { Hocuspocus } from "@hocuspocus/server";
import crypto from "crypto";
import * as Y from "yjs";
import type { DocumentStore } from "../persistence.js";
import { McpReadError } from "./mcp-error.js";
import { acquireDb, tableContentRevision } from "./relation-service.js";

/**
 * Authoritative server-side creation of one standalone, empty, project-owned
 * Table from a caller-supplied schema (issue #5411).
 *
 * A Table is a `yjsTables` registry entry in the project room plus its own
 * synchronized room `projects/<projectId>/tables/<tableId>`. Yjs cannot make
 * a write to two rooms atomic, so creation is ordered as preparation followed
 * by publication:
 *
 *   1. validate the request, authorize, and prove the declaration executable
 *      in an otherwise empty scratch PGlite database (nothing live is read or
 *      materialized except the registry's SQL-name claims);
 *   2. prepare a fresh Table room holding exactly the supplied schema and no
 *      records, and durably store it;
 *   3. re-authorize, then synchronously re-read the live SQL-name claims and
 *      publish one complete registry entry (no await between the two, so
 *      overlapping creations on this server serialize);
 *   4. durably store the project room.
 *
 * The typed outcome separates confirmed creation, a dry-run preview, and an
 * unknown outcome (publication happened in memory but its durable result
 * could not be established). Every thrown McpReadError is a confirmed
 * non-publication (no registry entry was added by this attempt), except a
 * `forbidden` whose debug outcome is `published_undisclosed`: access was
 * revoked after an authorized publication, so its result is withheld (the
 * thrown TableCreationUndisclosedError still carries the established outcome
 * for internal use). Every other thrown error is also converted to such a
 * confirmed non-publication. A prepared but unpublished Table room may
 * physically remain; it is not a Table.
 */

const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SQL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_SQL_NAMES = new Set(["outline_items"]);
export const MAX_TABLE_SCHEMA_BYTES = 16 * 1024;
const REQUEST_KEYS = new Set(["name", "schemaSql", "dryRun"]);
const PUBLICATION_ORIGIN = "mcp-create-table";

export interface CreateTableRequest {
    /** Display name, preserved exactly (an empty string stays empty). */
    name: string;
    /** One ordinary CREATE TABLE declaration, stored exactly as supplied. */
    schemaSql: string;
    dryRun?: boolean;
}

interface CandidateMetadata {
    displayName: string;
    sqlName: string;
    schemaSql: string;
}

export type CreateTableOutcome =
    /** Registered and, when persistence is configured, durably stored. */
    | CandidateMetadata & { status: "created"; applied: true; tableId: string; revision: string; }
    /** Dry run: the same decisions as an apply, but nothing written or reserved. */
    | CandidateMetadata & { status: "preview"; applied: false; dryRun: true; }
    /**
     * Publication was attempted but its durable result could not be
     * established. Neither success nor a claim that nothing was created; the
     * candidate id lets an authorized caller reconcile later. No revision is
     * reported because none is confirmed.
     */
    | CandidateMetadata & { status: "unknown"; applied: false; tableId: string; reason: string; };

/** An apply's outcome once its registry publication was attempted. */
export type PublishedOutcome = Extract<CreateTableOutcome, { status: "created" | "unknown"; }>;

export interface CreateTableOptions {
    /**
     * Awaited after the Table room is prepared (and stored) and before the
     * final authorization check and registry publication. Lets callers and
     * regression tests observe the contested pre-publication boundary.
     */
    beforePublication?: () => Promise<void>;
}

/**
 * Access was revoked after an authorized publication: the result is withheld
 * from the caller (`forbidden`, debug `published_undisclosed`), but the
 * publication's established outcome (created or unknown) is kept on the error
 * for internal bookkeeping such as replay retention and auditing. Never
 * serialize `outcome` into a response.
 */
export class TableCreationUndisclosedError extends McpReadError {
    constructor(public readonly outcome: PublishedOutcome) {
        super("forbidden", "Project is inaccessible", { outcome: "published_undisclosed" });
    }
}

type DirectConnection = Awaited<ReturnType<Hocuspocus["openDirectConnection"]>>;

export class OutlinerTableCreationService {
    constructor(
        private readonly hocuspocus: Pick<Hocuspocus, "openDirectConnection" | "documents">,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        /**
         * Durable storage acknowledgement for the configured production
         * persistence. Undefined only for intentionally nonpersistent
         * configurations, where creation is confirmed on in-memory publication.
         */
        private readonly storeDocument?: DocumentStore,
    ) {}

    async createTable(
        uid: string,
        projectId: string,
        request: CreateTableRequest,
        options: CreateTableOptions = {},
    ): Promise<CreateTableOutcome> {
        const { name, schemaSql, dryRun } = this.validateRequest(projectId, request);
        await this.authorize(uid, projectId);

        const projectRoom = `projects/${projectId}`;
        let projectConnection = await this.openLiveRoom(projectRoom, uid);
        let tableConnection: DirectConnection | undefined;
        /**
         * Re-authorize and resolve the room's live project Document after all
         * asynchronous prerequisites. Hocuspocus can orphan a held Document
         * (a delayed unload of an older instance deletes the room by name), so
         * an orphaned handle is released without storing and the live room is
         * reopened. Callers re-check liveness synchronously afterwards.
         */
        const publicationTarget = async (): Promise<Y.Doc> => {
            for (let attempt = 1; attempt <= 3; attempt++) {
                await this.authorize(uid, projectId);
                const doc = projectConnection.document as unknown as Y.Doc;
                if (this.isLive(projectRoom, doc)) return doc;
                releaseWithoutStore(projectConnection);
                projectConnection = await this.openLiveRoom(projectRoom, uid);
            }
            throw new McpReadError("internal_failure", "Project room could not be held", { outcome: "not_published" });
        };
        try {
            let project = projectConnection.document as unknown as Y.Doc;
            // An authorized ACL without a project document is not a project to
            // add Tables to; creation never initializes a project room.
            if (Y.encodeStateVector(project).length <= 1) {
                throw new McpReadError("not_found", "Project not found", { outcome: "not_published" });
            }
            const sqlName = await this.resolveSqlName(schemaSql);
            this.assertNameUnclaimed(project, sqlName);
            const candidate: CandidateMetadata = { displayName: name, sqlName, schemaSql };

            if (dryRun) {
                // Same final decisions as an apply, then nothing is written.
                await options.beforePublication?.();
                project = await publicationTarget();
                this.assertNameUnclaimed(project, sqlName);
                return { status: "preview", applied: false, dryRun: true, ...candidate };
            }

            const tableId = crypto.randomUUID();
            const tableRoom = `projects/${projectId}/tables/${tableId}`;
            let table: Y.Doc;
            try {
                tableConnection = await this.openLiveRoom(tableRoom, uid);
                table = tableConnection.document as unknown as Y.Doc;
                if (Y.encodeStateVector(table).length > 1) {
                    throw new Error("Candidate Table room is not empty");
                }
                table.transact(() => table.getText("schema").insert(0, schemaSql), PUBLICATION_ORIGIN);
                await this.storeDocument?.(tableRoom, table);
            } catch (error) {
                throw new McpReadError("internal_failure", "Table preparation failed; no Table was published", {
                    outcome: "not_published",
                    cause: error instanceof Error ? error.message : String(error),
                });
            }

            await options.beforePublication?.();
            project = await publicationTarget();
            if (!this.isLive(projectRoom, project)) {
                throw new McpReadError("internal_failure", "Project room was unloaded before publication", {
                    outcome: "not_published",
                });
            }

            // Mutation boundary: nothing below awaits until the registry entry
            // is published, so the live claims read here are the ones it is
            // published against, and no overlapping creation can interleave.
            this.assertNameUnclaimed(project, sqlName);
            if (table.getText("schema").toString() !== schemaSql || table.getMap("data").size !== 0) {
                throw new McpReadError("internal_failure", "Prepared Table changed before publication", {
                    outcome: "not_published",
                });
            }
            const registry = project.getMap<Y.Map<unknown>>("yjsTables");
            if (registry.has(tableId)) {
                throw new McpReadError("internal_failure", "Table ID collision", { outcome: "not_published" });
            }
            // The creation revision describes the exact state being published
            // (verified empty above, with no await since). Taken now, because
            // peers may edit the Table as soon as the entry is visible, before
            // storage below confirms the publication.
            const revision = tableContentRevision(tableId, name, sqlName, table);
            let publicationError: unknown;
            try {
                project.transact(() => {
                    // The complete entry is assembled before it is attached, so
                    // registry observers never see a partial Table.
                    const entry = new Y.Map<unknown>();
                    entry.set("name", name);
                    entry.set("sqlName", sqlName);
                    entry.set("doc", new Y.Doc({ guid: `${projectId}--table--${tableId}`, autoLoad: true }));
                    registry.set(tableId, entry);
                }, PUBLICATION_ORIGIN);
            } catch (error) {
                // A throwing observer runs after the change is applied.
                publicationError = error;
            }
            // The entry is attached in one set(), so it is either absent or complete.
            if (!registry.has(tableId)) {
                throw new McpReadError("internal_failure", "Table publication did not register", {
                    outcome: "not_published",
                    ...(publicationError !== undefined ? { cause: String(publicationError) } : {}),
                });
            }
            let outcome: PublishedOutcome;
            try {
                if (publicationError !== undefined) throw publicationError;
                await this.storeDocument?.(projectRoom, project);
                outcome = {
                    status: "created",
                    applied: true,
                    tableId,
                    ...candidate,
                    revision,
                };
            } catch (error) {
                outcome = {
                    status: "unknown",
                    applied: false,
                    tableId,
                    ...candidate,
                    reason: error instanceof Error ? error.message : String(error),
                };
            }
            // A grant revoked while publication was being stored does not
            // authorize disclosing its result. The publication itself stays:
            // it was authorized, and is never rolled back destructively. The
            // established outcome travels only on the error object, so an
            // outer layer can remember it without showing it to this caller.
            try {
                await this.authorize(uid, projectId, "published_undisclosed");
            } catch {
                throw new TableCreationUndisclosedError(outcome);
            }
            return outcome;
        } catch (error) {
            // Only the steps before publication can reach here (everything
            // after it is caught above and becomes an outcome), so an
            // unexpected failure is a confirmed non-publication.
            if (error instanceof McpReadError) throw error;
            throw new McpReadError("internal_failure", "Table creation failed; no Table was published", {
                outcome: "not_published",
                cause: error instanceof Error ? error.message : String(error),
            });
        } finally {
            // Releasing a connection never changes the established outcome.
            if (tableConnection) await this.close(tableConnection).catch(() => {});
            await this.close(projectConnection).catch(() => {});
        }
    }

    private validateRequest(projectId: string, request: CreateTableRequest): Required<CreateTableRequest> {
        if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) {
            throw new McpReadError("invalid_argument", "Invalid project ID");
        }
        if (!request || typeof request !== "object" || Array.isArray(request)) {
            throw new McpReadError("invalid_argument", "A Table creation request is required");
        }
        const unexpected = Object.keys(request).filter(key => !REQUEST_KEYS.has(key));
        if (unexpected.length > 0) {
            throw new McpReadError("invalid_argument", `Unsupported Table creation field(s): ${unexpected.join(", ")}`);
        }
        const { name, schemaSql, dryRun } = request;
        if (typeof name !== "string") throw new McpReadError("invalid_argument", "Table name must be a string");
        if (typeof schemaSql !== "string" || !schemaSql.trim()) {
            throw new McpReadError("invalid_argument", "schemaSql must be a non-blank CREATE TABLE declaration");
        }
        const bytes = Buffer.byteLength(schemaSql, "utf8");
        if (bytes > MAX_TABLE_SCHEMA_BYTES) {
            throw new McpReadError(
                "size_limit",
                `Schema of ${bytes} bytes exceeds the ${MAX_TABLE_SCHEMA_BYTES}-byte limit`,
                { actualBytes: bytes, limitBytes: MAX_TABLE_SCHEMA_BYTES },
            );
        }
        if (dryRun !== undefined && typeof dryRun !== "boolean") {
            throw new McpReadError("invalid_argument", "dryRun must be a boolean");
        }
        return { name, schemaSql, dryRun: dryRun ?? false };
    }

    /**
     * Open a direct connection whose Document is the room's live one.
     * Hocuspocus can hand an open that races a room unload the Document being
     * destroyed; the next open loads a fresh one. Claims read from, or an entry
     * published to, that orphan would not be the live state, and its normal
     * disconnect would store its stale state over the live room's. Such a
     * handle is therefore released without storing, and the room reopened.
     */
    private async openLiveRoom(room: string, uid: string): Promise<DirectConnection> {
        for (let attempt = 1; attempt <= 3; attempt++) {
            const connection = await this.hocuspocus.openDirectConnection(room, { context: { uid } });
            if (this.isLive(room, connection.document as unknown as Y.Doc)) return connection;
            releaseWithoutStore(connection);
        }
        throw new McpReadError("internal_failure", "Room could not be opened", { outcome: "not_published" });
    }

    /** Disconnect normally, unless the handle was orphaned and would store stale state. */
    private async close(connection: DirectConnection): Promise<void> {
        const doc = connection.document;
        if (doc && !this.isLive(doc.name, doc as unknown as Y.Doc)) releaseWithoutStore(connection);
        else await connection.disconnect();
    }

    private isLive(room: string, doc: Y.Doc): boolean {
        return this.hocuspocus.documents.get(room) === (doc as unknown);
    }

    /**
     * An unavailable or erroring ACL lookup is a denial. `outcome` records
     * what a denial means for this attempt: nothing was published yet, or a
     * publication happened but its result is withheld from the caller.
     */
    private async authorize(
        uid: string,
        projectId: string,
        outcome: "not_published" | "published_undisclosed" = "not_published",
    ): Promise<void> {
        let allowed = false;
        try {
            allowed = await this.canAccess(uid, projectId);
        } catch {
            allowed = false;
        }
        if (allowed !== true) {
            throw new McpReadError("forbidden", "Project is inaccessible", { outcome });
        }
    }

    /** The project's registered sqlName values are its published namespace claims. */
    private assertNameUnclaimed(project: Y.Doc, sqlName: string): void {
        for (const [tableId, entry] of project.getMap<Y.Map<unknown>>("yjsTables").entries()) {
            if (entry instanceof Y.Map && entry.get("sqlName") === sqlName) {
                throw new McpReadError(
                    "validation_failed",
                    `Table name "${sqlName}" is already used by another Table`,
                    {
                        code: "relation_name_unavailable",
                        sqlName,
                        conflictingTableId: tableId,
                        outcome: "not_published",
                    },
                );
            }
        }
    }

    /**
     * Resolve the declaration's SQL name through the executable oracle: it
     * must run in an otherwise empty isolated PGlite database and leave
     * exactly one ordinary, permanent, empty base table in `public`.
     */
    private async resolveSqlName(schemaSql: string): Promise<string> {
        const syntaxError = checkCreateTableShape(schemaSql);
        if (syntaxError) throw this.schemaRejection(syntaxError);
        const lease = await acquireDb();
        try {
            if ((await userRelations(lease.db)).length > 0) {
                throw new McpReadError("internal_failure", "Schema validation database is not isolated", {
                    outcome: "not_published",
                });
            }
            try {
                await lease.db.exec(schemaSql);
            } catch (error) {
                throw this.schemaRejection(error instanceof Error ? error.message : String(error));
            }
            const relations = await userRelations(lease.db);
            if (relations.length !== 1) {
                throw this.schemaRejection("Schema definition must create exactly one table");
            }
            const [relation] = relations;
            if (relation.schema !== "public") {
                throw this.schemaRejection("Schema-qualified or temporary tables are not supported");
            }
            if (relation.kind !== "r" || relation.persistence !== "p") {
                throw this.schemaRejection("Only ordinary, permanent tables are supported");
            }
            const sqlName = relation.name;
            const quoted = `"${sqlName.replace(/"/g, '""')}"`;
            const columns = await lease.db.query<{ count: number; }>(
                "SELECT count(*)::int AS count FROM pg_attribute WHERE attrelid = $1::regclass "
                    + "AND attnum > 0 AND NOT attisdropped",
                [quoted],
            );
            if ((columns.rows[0]?.count ?? 0) < 1) {
                throw this.schemaRejection("Table must define at least one column");
            }
            const records = await lease.db.query<{ count: number; }>(`SELECT count(*)::int AS count FROM ${quoted}`);
            if ((records.rows[0]?.count ?? 0) !== 0) {
                throw this.schemaRejection("Schema definition must create an empty table");
            }
            if (!SQL_NAME.test(sqlName)) {
                throw this.schemaRejection(`Table name "${sqlName}" must match [A-Za-z_][A-Za-z0-9_]*`);
            }
            if (RESERVED_SQL_NAMES.has(sqlName)) {
                throw new McpReadError("validation_failed", `Table name "${sqlName}" is reserved`, {
                    code: "relation_name_unavailable",
                    sqlName,
                    outcome: "not_published",
                });
            }
            return sqlName;
        } finally {
            try {
                await clearUserRelations(lease.db);
            } finally {
                lease.release();
            }
        }
    }

    private schemaRejection(message: string): McpReadError {
        return new McpReadError("validation_failed", "Table schema validation failed", {
            code: "invalid_schema",
            message,
            outcome: "not_published",
        });
    }
}

/** Drop an orphaned Document handle without Hocuspocus storing its stale state. */
function releaseWithoutStore(connection: DirectConnection): void {
    connection.document?.removeDirectConnection();
    connection.document = null;
}

interface UserRelation {
    schema: string;
    name: string;
    kind: string;
    persistence: string;
}

/** Every table-like relation outside the system catalogs, temporary schemas included. */
async function userRelations(db: PGlite): Promise<UserRelation[]> {
    const result = await db.query<UserRelation>(
        "SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind, c.relpersistence AS persistence "
            + "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            + "WHERE c.relkind IN ('r', 'p', 'f', 'v', 'm') "
            + "AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'",
    );
    return result.rows;
}

async function clearUserRelations(db: PGlite): Promise<void> {
    for (const relation of await userRelations(db)) {
        const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
        const kind = relation.kind === "v" ? "VIEW" : relation.kind === "m" ? "MATERIALIZED VIEW" : "TABLE";
        await db.exec(`DROP ${kind} IF EXISTS ${quote(relation.schema)}.${quote(relation.name)} CASCADE`);
    }
}

/**
 * Replace comments with whitespace and quoted literals/identifiers with empty
 * placeholders, following PostgreSQL's lexical rules (nested block comments,
 * doubled quotes, E'' backslash escapes, dollar quoting), so control words and
 * semicolons inside them are never mistaken for statement structure.
 * Returns undefined when a quote or comment is left unterminated.
 */
export function maskSqlNoise(sql: string): string | undefined {
    const identChar = /[A-Za-z0-9_$\u0080-￿]/;
    let out = "";
    let i = 0;
    while (i < sql.length) {
        const c = sql[i];
        const next = sql[i + 1];
        if (c === "-" && next === "-") {
            const end = sql.indexOf("\n", i);
            i = end < 0 ? sql.length : end;
            out += " ";
        } else if (c === "/" && next === "*") {
            let depth = 1;
            i += 2;
            while (i < sql.length && depth > 0) {
                if (sql[i] === "/" && sql[i + 1] === "*") (depth++, i += 2);
                else if (sql[i] === "*" && sql[i + 1] === "/") (depth--, i += 2);
                else i++;
            }
            if (depth > 0) return undefined;
            out += " ";
        } else if (c === "'") {
            const backslashEscapes = /[eE]/.test(sql[i - 1] ?? "") && !identChar.test(sql[i - 2] ?? "");
            let closed = false;
            i++;
            while (i < sql.length) {
                if (backslashEscapes && sql[i] === "\\") i += 2;
                else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
                else if (sql[i] === "'") {
                    closed = true;
                    i++;
                    break;
                } else i++;
            }
            if (!closed) return undefined;
            out += "''";
        } else if (c === '"') {
            let closed = false;
            i++;
            while (i < sql.length) {
                if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
                else if (sql[i] === '"') {
                    closed = true;
                    i++;
                    break;
                } else i++;
            }
            if (!closed) return undefined;
            out += '""';
        } else if (c === "$" && !identChar.test(sql[i - 1] ?? "")) {
            const tag = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(sql.slice(i))?.[0];
            if (!tag) {
                out += c;
                i++;
                continue;
            }
            const end = sql.indexOf(tag, i + tag.length);
            if (end < 0) return undefined;
            i = end + tag.length;
            out += "''";
        } else {
            out += c;
            i++;
        }
    }
    return out;
}

/**
 * The accepted schema domain's syntactic shape: exactly one unqualified
 * `CREATE TABLE [IF NOT EXISTS] name (...)` declaration. Everything else
 * (temporary/unlogged tables, CREATE TABLE AS/OF/PARTITION OF, schema-qualified
 * targets, DDL scripts) is refused before execution. Returns an error message,
 * or undefined when the shape is acceptable.
 */
export function checkCreateTableShape(schemaSql: string): string | undefined {
    const masked = maskSqlNoise(schemaSql);
    if (masked === undefined) return "Schema definition has an unterminated quote or comment";
    const statement = masked.trim().replace(/;\s*$/, "");
    if (statement.includes(";")) return "Schema definition must contain exactly one statement";
    if (/^create\s+(?:(?:global|local)\s+)?(?:temp|temporary|unlogged)\b/i.test(statement)) {
        return "Temporary and unlogged tables are not supported";
    }
    const head = /^create\s+table\s+(?:if\s+not\s+exists\s+)?(?:""|[A-Za-z_\u0080-￿][A-Za-z0-9_$\u0080-￿]*)\s*(\S?)/i
        .exec(statement);
    if (!head) return "Schema definition must be a single CREATE TABLE declaration";
    if (head[1] === ".") return "Schema-qualified table names are not supported";
    if (head[1] !== "(") {
        return "Schema definition must declare columns in parentheses (CREATE TABLE AS/OF is not supported)";
    }
    return undefined;
}
