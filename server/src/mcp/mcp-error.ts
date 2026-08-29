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
    ) {
        super(message);
    }
}
