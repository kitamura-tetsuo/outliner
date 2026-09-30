import { McpEffectError, McpReadError } from "./mcp-error.js";
import { IdempotencyCache } from "./mutation-contract.js";
import {
    type CreateTableOutcome,
    type OutlinerTableCreationService,
    type PublishedOutcome,
    TableCreationUndisclosedError,
} from "./table-creation.js";
import { toolOutputSchemas } from "./tool-output-schemas.js";

/**
 * The MCP `create_table` mutation (issue #5412) around the authoritative
 * server-side standalone Table creation boundary (issue #5411).
 *
 * Replay identity is (tool, uid, projectId, operationId) in this process. The
 * cache holds the typed domain outcome, not a formatted response: a confirmed
 * creation and an unknown outcome (publication attempted, durable result not
 * established) are both resolved values, retained for five minutes after they
 * settle; a confirmed pre-publication refusal is a rejection, which the cache
 * evicts so the same operation ID may be attempted again. Request-specific
 * authorization and response-formatting failures happen after the cache and
 * never remove an established outcome.
 *
 * Authorization runs before any replay lookup (a denied call neither reads,
 * expires, nor creates cache state), at publication inside the domain, and
 * again before any awaited result is disclosed.
 */

export interface CreateTableToolArgs {
    projectId: string;
    name: string;
    schemaSql: string;
    operationId: string;
    dryRun?: boolean;
}

export interface CreateTableToolResult {
    applied: boolean;
    replayed: boolean;
    tableId?: string;
    displayName: string;
    sqlName: string;
    schemaSql: string;
    revision?: string;
}

/** What a settled apply is remembered as. */
type Settled = PublishedOutcome | { status: "unknown"; tableId?: undefined; };

type Domain = Pick<OutlinerTableCreationService, "createTable">;

/** Refusal debug fields that are safe, useful diagnostics for the caller. */
const SAFE_REFUSAL_FIELDS = ["sqlName", "conflictingTableId", "actualBytes", "limitBytes"] as const;

export class CreateTableTool {
    private readonly replay: IdempotencyCache;

    constructor(
        private readonly domain: Domain,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        /** Retention clock (defaults to wall time). */
        now: () => number = Date.now,
    ) {
        this.replay = new IdempotencyCache(now);
    }

    async create(uid: string, args: CreateTableToolArgs): Promise<CreateTableToolResult> {
        const { projectId, name, schemaSql, operationId, dryRun } = args;
        await this.authorize(uid, projectId);
        const request = { name, schemaSql };

        if (dryRun) {
            // Previews bypass replay state completely: no lookup, no entry.
            let preview: CreateTableOutcome;
            try {
                preview = await this.domain.createTable(uid, projectId, { ...request, dryRun: true });
            } catch (error) {
                throw refusal(error, true);
            }
            await this.authorize(uid, projectId);
            return this.deliver({
                applied: false,
                replayed: false,
                displayName: preview.displayName,
                sqlName: preview.sqlName,
                schemaSql: preview.schemaSql,
            }, { applied: false, replayed: false });
        }

        const key = JSON.stringify(["create_table", uid, projectId, operationId]);
        let settled: Settled;
        let replayed: boolean;
        try {
            ({ result: settled, replayed } = await this.replay.run<Settled>(
                key,
                () => this.attempt(uid, projectId, request),
            ));
        } catch (error) {
            // Only confirmed non-publications reject; the cache has evicted them.
            throw refusal(error);
        }

        const effect = {
            applied: settled.status === "created" ? true : null,
            replayed,
            creationOutcome: settled.status,
            entity: settled.tableId !== undefined ? `table:${settled.tableId}` : undefined,
            newRevision: settled.status === "created" ? settled.revision : undefined,
        } as const;
        // Disclosure boundary: a caller revoked while it waited learns nothing
        // about the outcome, and the retained outcome is left untouched.
        try {
            await this.authorize(uid, projectId);
        } catch {
            throw new McpEffectError("forbidden", "Project is inaccessible", {}, effect);
        }

        if (settled.status === "unknown") {
            throw new McpEffectError("internal_failure", "The Table creation outcome is unknown", {
                creationOutcome: "unknown",
                applied: null,
                replayed,
                ...(settled.tableId !== undefined ? { tableId: settled.tableId } : {}),
            }, effect);
        }
        return this.deliver({
            applied: true,
            replayed,
            tableId: settled.tableId,
            displayName: settled.displayName,
            sqlName: settled.sqlName,
            schemaSql: settled.schemaSql,
            revision: settled.revision,
        }, effect);
    }

    /** One domain attempt, resolved to what the replay cache remembers. */
    private async attempt(uid: string, projectId: string, request: { name: string; schemaSql: string; }) {
        let outcome: CreateTableOutcome;
        try {
            outcome = await this.domain.createTable(uid, projectId, request);
        } catch (error) {
            // Published, but withheld from a caller revoked meanwhile: the
            // publication is still this operation's remembered outcome.
            if (error instanceof TableCreationUndisclosedError) return error.outcome;
            // Every other domain McpReadError is a confirmed non-publication.
            if (error instanceof McpReadError) throw error;
            // The domain converts pre-publication failures, so anything else
            // cannot be proven harmless: remember it as unknown.
            return { status: "unknown" } as Settled;
        }
        if (outcome.status === "preview") throw new Error("Apply returned a preview");
        return outcome;
    }

    /** Successful output fails closed instead of forwarding a malformed result. */
    private deliver(
        result: CreateTableToolResult,
        effect: ConstructorParameters<typeof McpEffectError>[3],
    ): CreateTableToolResult {
        if (toolOutputSchemas.create_table.safeParse(result).success) return result;
        const known = effect.creationOutcome
            ? { creationOutcome: effect.creationOutcome, applied: effect.applied, replayed: effect.replayed }
            : {};
        throw new McpEffectError("internal_failure", "The Table creation result could not be delivered", known, effect);
    }

    private async authorize(uid: string, projectId: string): Promise<void> {
        let allowed = false;
        try {
            allowed = await this.canAccess(uid, projectId);
        } catch {
            allowed = false;
        }
        if (allowed !== true) throw new McpReadError("forbidden", "Project is inaccessible");
    }
}

/**
 * Map a confirmed pre-publication refusal to its client contract: the domain
 * error code, a machine-readable `reason` for validation failures, only
 * allow-listed diagnostics (never a raw internal cause), and an explicit
 * not-created outcome. Denials carry nothing beyond the code.
 */
function refusal(error: unknown, dryRun = false): McpReadError {
    // A dry run never creates anything, so it reports no creation outcome.
    const outcome = dryRun ? {} : { creationOutcome: "not_created" as const };
    const effect = { applied: false, replayed: false, ...outcome };
    if (!(error instanceof McpReadError)) {
        return new McpEffectError("internal_failure", "Table creation failed; no Table was created", {
            ...outcome,
            applied: false,
        }, effect);
    }
    if (error.code === "forbidden") return new McpReadError("forbidden", "Project is inaccessible");
    const debug = error.debug ?? {};
    const details: Record<string, unknown> = { ...outcome, applied: false };
    if (typeof debug.code === "string") details.reason = debug.code;
    if (debug.code === "invalid_schema" && typeof debug.message === "string") details.detail = debug.message;
    for (const field of SAFE_REFUSAL_FIELDS) if (debug[field] !== undefined) details[field] = debug[field];
    const message = error.code === "internal_failure" ? "Table creation failed; no Table was created" : error.message;
    return new McpEffectError(error.code, message, details, effect);
}
