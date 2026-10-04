import {
    type GridPresentation,
    GridPresentationEffectError,
    type GridPresentationReceipt,
    GridPresentationUndisclosedError,
    type GridPresentationUpdateOptions,
    GridPresentationWithheldNoOpError,
    type OutlinerGridPresentationService,
    type UpdateGridPresentationRequest,
    validateGridPresentationRequest,
} from "./grid-presentation.js";
import { McpEffectError, McpReadError } from "./mcp-error.js";
import { IdempotencyCache } from "./mutation-contract.js";
import { toolOutputSchemas } from "./tool-output-schemas.js";

/**
 * The MCP `update_grid_presentation` mutation (issue #5436) around the
 * authoritative server-side Grid presentation boundary (issue #5435).
 *
 * Replay identity is (tool, uid, projectId, gridId, exact operationId) in
 * this process, with a canonical fingerprint of the exact
 * `expectedPresentationRevision` and `changes` (object property order
 * ignored, supplied values unnormalized). The cache holds the settled domain
 * outcome, not a formatted response: a confirmed apply (including an accepted
 * no-op) and an unknown outcome (mutation attempted, durable result not
 * established) are both resolved values, retained for five minutes after they
 * settle; a confirmed pre-effect refusal is a rejection, which the cache
 * evicts so the same operation ID may be attempted again. A retained replay
 * returns the original outcome with `replayed: true`, never a fresh snapshot,
 * so it can neither overwrite a later edit nor recreate a deleted Grid.
 * Dry runs bypass replay state completely: no lookup, no entry.
 *
 * Authorization runs before any replay lookup (a denied call neither reads,
 * expires, nor creates cache state), inside the domain at the final mutation
 * boundary, and again before any awaited result is disclosed; a revocation
 * meanwhile withholds the result but keeps the established effect.
 *
 * Replay is neither restart-durable nor guaranteed after expiry or across
 * independent service processes: it lives only in this serving process.
 */

export interface UpdateGridPresentationToolArgs {
    projectId: string;
    gridId: string;
    expectedPresentationRevision: string;
    /** Passed to the domain validator unchanged; shape errors stay domain-coded. */
    changes: unknown;
    operationId: string;
    dryRun?: boolean;
}

export interface UpdateGridPresentationToolResult {
    projectId: string;
    gridId: string;
    dryRun: boolean;
    applied: boolean;
    replayed: boolean;
    priorPresentationRevision: string;
    presentationRevision: string;
    presentation: GridPresentation;
    candidatePresentation?: GridPresentation;
    wouldChange?: boolean;
}

/** What a settled apply is remembered as. */
type Settled = GridPresentationReceipt;

type Domain = Pick<OutlinerGridPresentationService, "updatePresentation">;

export class UpdateGridPresentationTool {
    private readonly replay: IdempotencyCache;

    constructor(
        private readonly domain: Domain,
        private readonly canAccess: (uid: string, projectId: string) => Promise<boolean>,
        /** Retention clock (defaults to wall time). */
        now: () => number = Date.now,
    ) {
        this.replay = new IdempotencyCache(now);
    }

    async update(
        uid: string,
        args: UpdateGridPresentationToolArgs,
        options: GridPresentationUpdateOptions = {},
    ): Promise<UpdateGridPresentationToolResult> {
        const { projectId, gridId, expectedPresentationRevision, changes, operationId, dryRun } = args;
        // Shape first (pure, inspects neither the target nor replay state —
        // the same order the domain boundary and the read services use), then
        // project permission before any replay lookup, target read or effect.
        validateGridPresentationRequest({ projectId, gridId, expectedPresentationRevision, changes, dryRun });
        assertOperationId(operationId);
        await this.authorize(uid, projectId);

        if (dryRun) {
            // Previews bypass replay state completely: no lookup, no entry,
            // and never consult or consume an outcome retained for the ID.
            let preview: Awaited<ReturnType<Domain["updatePresentation"]>>;
            try {
                preview = await this.domain.updatePresentation(uid, {
                    projectId,
                    gridId,
                    expectedPresentationRevision,
                    changes: changes as UpdateGridPresentationRequest["changes"],
                    dryRun: true,
                }, options);
            } catch (error) {
                throw await this.refuse(uid, projectId, error);
            }
            if (preview.dryRun !== true) throw new Error("Preview returned an apply");
            await this.authorize(uid, projectId);
            return this.deliver({
                dryRun: true,
                applied: false,
                replayed: false,
                projectId,
                gridId,
                priorPresentationRevision: preview.priorPresentationRevision,
                presentationRevision: preview.presentationRevision,
                presentation: preview.presentation,
                candidatePresentation: preview.candidatePresentation,
                wouldChange: preview.wouldChange,
            }, { applied: false, replayed: false });
        }

        const key = JSON.stringify(["update_grid_presentation", uid, projectId, gridId, operationId]);
        const fingerprint = canonicalFingerprint({ expectedPresentationRevision, changes });
        let settled: Settled;
        let replayed: boolean;
        try {
            ({ result: settled, replayed } = await this.replay.runChecked<Settled>(
                key,
                fingerprint,
                () => this.attempt(uid, projectId, gridId, expectedPresentationRevision, changes, options),
            ));
        } catch (error) {
            // Only confirmed non-publications reject; the cache has evicted them.
            throw await this.refuse(uid, projectId, error);
        }

        const effect = {
            applied: settled.status === "applied" ? settled.applied : null,
            replayed,
        } as const;
        // Disclosure boundary: a caller revoked while it waited learns nothing
        // about the outcome, and the retained outcome is left untouched.
        try {
            await this.authorize(uid, projectId);
        } catch {
            throw new McpEffectError("forbidden", "Project is inaccessible", {}, effect);
        }

        if (settled.status === "unknown") {
            throw new McpEffectError(
                "internal_failure",
                "The Grid presentation update outcome is unknown",
                { applied: null, replayed, reason: settled.reason },
                effect,
            );
        }
        const { status: _status, ...applied } = settled;
        return this.deliver({ ...applied, replayed }, effect);
    }

    /** One domain attempt, resolved to what the replay cache remembers. */
    private async attempt(
        uid: string,
        projectId: string,
        gridId: string,
        expectedPresentationRevision: string,
        changes: unknown,
        options: GridPresentationUpdateOptions,
    ): Promise<Settled> {
        try {
            const outcome = await this.domain.updatePresentation(uid, {
                projectId,
                gridId,
                expectedPresentationRevision,
                changes: changes as UpdateGridPresentationRequest["changes"],
            }, options);
            if (outcome.dryRun !== false) throw new Error("Apply returned a preview");
            return { status: "applied", ...outcome };
        } catch (error) {
            // Withheld from a caller revoked meanwhile, or uncertain after a
            // mutation: the receipt is still this operation's remembered
            // outcome, so a same-identity retry must not invoke the writer again.
            if (error instanceof GridPresentationUndisclosedError) return error.receipt;
            if (error instanceof GridPresentationWithheldNoOpError) return error.receipt;
            if (error instanceof GridPresentationEffectError) return error.receipt;
            throw error;
        }
    }

    /** Successful output fails closed instead of forwarding a malformed result. */
    private deliver(
        result: UpdateGridPresentationToolResult,
        effect: { applied: boolean | null; replayed: boolean; },
    ): UpdateGridPresentationToolResult {
        if (toolOutputSchemas.update_grid_presentation.safeParse(result).success) return result;
        throw new McpEffectError(
            "internal_failure",
            "The Grid presentation result could not be delivered",
            { applied: effect.applied, replayed: effect.replayed },
            effect,
        );
    }

    /**
     * An awaited refusal is a disclosure too (a stale conflict names the
     * current revision, a missing target confirms absence): a caller revoked
     * while it waited gets a bare forbidden instead.
     */
    private async refuse(uid: string, projectId: string, error: unknown): Promise<McpReadError> {
        if (error instanceof McpEffectError) {
            try {
                await this.authorize(uid, projectId);
            } catch {
                return new McpEffectError("forbidden", "Project is inaccessible", {}, error.effect);
            }
            return error;
        }
        if (error instanceof McpReadError) {
            if (error.code === "forbidden") return new McpReadError("forbidden", "Project is inaccessible");
            try {
                await this.authorize(uid, projectId);
            } catch {
                return new McpReadError("forbidden", "Project is inaccessible");
            }
            return error;
        }
        return new McpReadError("internal_failure", "Grid presentation update failed; nothing was changed");
    }

    private async authorize(uid: string, projectId: string): Promise<void> {
        let allowed = false;
        try {
            allowed = typeof projectId === "string" && await this.canAccess(uid, projectId);
        } catch {
            allowed = false;
        }
        if (allowed !== true) throw new McpReadError("forbidden", "Project is inaccessible");
    }
}

/** The required retry identity: a nonblank string of at most 200 characters, kept exact. */
function assertOperationId(operationId: unknown): asserts operationId is string {
    if (
        typeof operationId !== "string" || operationId.length < 1 || operationId.length > 200
        || operationId.trim() === ""
    ) {
        throw new McpReadError("invalid_argument", "operationId must be a nonblank string of at most 200 characters");
    }
}

/**
 * Canonical fingerprint of the exact request input: object property order is
 * ignored, but supplied values (including whitespace and case) are never
 * normalized, and arrays keep their order.
 */
export function canonicalFingerprint(value: unknown): string {
    return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === "object") {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) return value;
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
                .map(([key, child]) => [key, canonicalize(child)]),
        );
    }
    return value;
}
