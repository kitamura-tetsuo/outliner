/**
 * The shared MCP error contract (issue FTR mutation-safety-contract /
 * GitHub #5208): every read and write tool throws exactly one of these
 * codes so mcp-api.ts can map them to a consistent structured MCP error
 * response instead of leaking ad-hoc messages per tool.
 *
 * Lives in its own module (rather than outliner-read-service.ts, where it
 * originated) so that mutation-contract.ts can throw it without creating
 * an import cycle: outliner-read-service.ts also needs mutation-contract's
 * revision helpers to attach a `revision` to its read results.
 *
 *  - invalid_argument: malformed/out-of-range input the caller supplied.
 *  - not_found: the target entity does not exist.
 *  - forbidden: missing OAuth scope or an inaccessible project.
 *  - kind_mismatch: the target exists but is the wrong outline node kind.
 *  - stale_revision: an expectedRevision precondition did not match.
 *  - validation_failed: input was well-formed but violates a business rule
 *    (e.g. a non-writable column, a SQL constraint).
 *  - destructive_confirmation_required: a well-formed, otherwise-valid Table
 *    schema migration would remove or retype a column; retry the same call
 *    with acknowledgeDestructive: true to apply it.
 *  - size_limit: a request or payload exceeded a server-imposed bound.
 *  - internal_failure: an unexpected error; the message is safe to show.
 */
export type McpErrorCode =
    | "invalid_argument"
    | "not_found"
    | "forbidden"
    | "kind_mismatch"
    | "stale_revision"
    | "validation_failed"
    | "destructive_confirmation_required"
    | "size_limit"
    | "internal_failure";

export class McpReadError extends Error {
    constructor(
        public readonly code: McpErrorCode,
        message: string,
        public readonly debug?: Record<string, unknown>,
        /**
         * Set only when this rejection stems from a missing OAuth scope
         * (issue #5257). mcp-api.ts uses this to attach a standards-shaped
         * `_meta["mcp/www_authenticate"]` insufficient_scope challenge to the
         * tool result, so an MCP/ChatGPT client has a reliable trigger for
         * step-up reauthorization instead of only a structured `forbidden`
         * error body.
         */
        public readonly requiredScope?: string,
    ) {
        super(message);
    }
}

/**
 * What an MCP mutation attempt is known to have done, for the audit record of
 * a request that nevertheless ends in an error. `applied: null` means the
 * effect is unknown (publication was attempted but its durable result could
 * not be established); it is neither success nor a claim that nothing changed.
 */
export interface McpEffect {
    applied: boolean | null;
    replayed: boolean;
    creationOutcome?: "created" | "unknown" | "not_created";
    entity?: string;
    newRevision?: string;
}

/**
 * An error response whose request still has a known (or explicitly unknown)
 * effect, e.g. a Table was created but its result is withheld from a caller
 * whose access was revoked. `debug` is the complete, already-sanitized client
 * payload; `effect` goes only to the internal audit record.
 */
export class McpEffectError extends McpReadError {
    constructor(
        code: McpErrorCode,
        message: string,
        debug: Record<string, unknown>,
        public readonly effect: McpEffect,
    ) {
        super(code, message, debug);
    }
}
