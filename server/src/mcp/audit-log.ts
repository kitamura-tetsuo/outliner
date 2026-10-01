import { mcpLogger as logger } from "../utils/log-manager.js";
import type { McpErrorCode } from "./outliner-read-service.js";

/**
 * Structured audit record for one MCP mutation attempt (issue #5208's
 * "shared mutation safety contract"). Recorded for every write_relation /
 * set_view_query call regardless of outcome, so a reviewer can reconstruct
 * who attempted what, when, and whether it actually changed anything —
 * without ever persisting secrets, tokens, or full row/column payloads.
 */
export interface McpAuditEntry {
    requestId: string;
    /** SHA-256 fingerprint of the authenticated uid, never the raw uid. */
    uidFingerprint: string;
    tool: string;
    projectId?: string;
    /** Relation name, or "kind:viewId" for a Grid/Calendar view query. */
    entity?: string;
    operationId?: string;
    dryRun: boolean;
    /** "success", or the McpErrorCode category on failure. */
    outcome: "success" | McpErrorCode;
    priorRevision?: string;
    newRevision?: string;
    /**
     * Whether the mutation was actually persisted (false for dry runs).
     * null only when the effect is unknown: publication was attempted but its
     * durable result could not be established (create_table).
     */
    applied: boolean | null;
    /**
     * create_table only: the domain outcome, recorded even when the caller is
     * shown an error (an unknown publication, or a result withheld from a
     * caller whose access was revoked after an authorized creation).
     */
    creationOutcome?: "created" | "unknown" | "not_created";
    /**
     * True when this attempt was an operationId replay: the mutation
     * itself ran on an earlier request, and this one only observed the
     * cached result. Without this flag N retries of the same operationId
     * would misleadingly read as N independent applied mutations.
     */
    replayed: boolean;
}

/**
 * Writes one "mcp_audit" JSONL record to the durable MCP log. Deliberately
 * takes a fully-formed McpAuditEntry rather than raw args/results so callers
 * cannot accidentally forward a secret or a full write payload into the log.
 */
export function recordMcpAudit(entry: McpAuditEntry): void {
    const {
        requestId,
        uidFingerprint,
        tool,
        projectId,
        entity,
        operationId,
        dryRun,
        outcome,
        priorRevision,
        newRevision,
        applied,
        creationOutcome,
        replayed,
    } = entry;
    logger.info({
        event: "mcp_audit",
        requestId,
        uidFingerprint,
        tool,
        projectId,
        entity,
        operationId,
        dryRun,
        outcome,
        priorRevision,
        newRevision,
        applied,
        creationOutcome,
        replayed,
        timestamp: new Date().toISOString(),
    }, "mcp_audit");
}
