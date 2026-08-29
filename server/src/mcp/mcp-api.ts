import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import crypto from "crypto";
import express from "express";
import * as z from "zod/v4";
import { getOAuthIssuer } from "../oauth/config.js";
import { verifyAccessToken } from "../oauth/tokens.js";
import { mcpLogger as logger } from "../utils/log-manager.js";
import { recordMcpAudit } from "./audit-log.js";
import { type McpErrorCode, McpReadError, OutlinerReadService } from "./outliner-read-service.js";
import { OutlinerRelationService } from "./relation-service.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

const response = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
/**
 * The MCP SDK's own tool-dispatch error handling discards everything a
 * thrown error carries except its message (see McpServer.createToolError),
 * so the shared error contract's `code` — the field clients need to tell a
 * stale_revision conflict from a forbidden-scope rejection — has to travel
 * inside the returned tool result instead of being thrown. This builds
 * that CallToolResult directly: isError: true with the structured contract
 * as JSON text.
 */
const errorResponse = (message: string, code: McpErrorCode, debug?: Record<string, unknown>) => ({
    content: [{ type: "text" as const, text: JSON.stringify({ error: message, code, ...debug }) }],
    isError: true as const,
});
const safeLogDiagnostics = (debug: Record<string, unknown> | undefined) =>
    debug
        ? {
            stage: debug.stage,
            accessibleProjectCount: debug.accessibleProjectCount,
            authorizedCandidateCount: debug.authorizedCandidateCount,
            foundProjectWithoutEntity: debug.foundProjectWithoutEntity,
            entityKind: debug.entityKind,
            inputLength: debug.inputLength,
            pathnameLength: debug.pathnameLength,
            pathname: debug.pathname,
            projectSegment: debug.projectSegment,
            interpretedAs: debug.interpretedAs,
            lookupCondition: debug.lookupCondition,
            internalOperation: debug.internalOperation,
            directoryErrorCode: debug.directoryErrorCode,
            projectId: debug.projectId,
            descriptorState: debug.descriptorState,
            storedTitleType: debug.storedTitleType,
            storedTitleEqualsProjectId: debug.storedTitleEqualsProjectId,
        }
        : {};

export function createMcpRouter(
    service: OutlinerReadService,
    verifyToken: (token: string) => { uid: string; scope: string; } = verifyAccessToken,
    configuredIssuer?: string,
    relationService?: OutlinerRelationService,
) {
    const router = express.Router();
    const issuer = () => configuredIssuer ?? getOAuthIssuer();
    const resourceMetadata = () => `${issuer()}/.well-known/oauth-protected-resource/mcp`;
    const challenge = () => `Bearer resource_metadata="${resourceMetadata()}"`;

    router.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], (_req, res) => {
        res.json({
            resource: `${issuer()}/mcp`,
            authorization_servers: [issuer()],
            bearer_methods_supported: ["header"],
            scopes_supported: ["outliner.read", "outliner.write"],
        });
    });

    router.all("/mcp", (req, res, next) => {
        const suppliedRequestId = req.header("x-request-id");
        const requestId = suppliedRequestId && /^[A-Za-z0-9_-]{1,100}$/.test(suppliedRequestId)
            ? suppliedRequestId
            : crypto.randomUUID();
        res.locals.mcpRequestId = requestId;
        res.set("X-Request-Id", requestId);
        const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!token) {
            logger.info({ event: "mcp_authentication_failed", requestId, reason: "missing_bearer" });
            return void res.set("WWW-Authenticate", challenge()).status(401).json({ error: "unauthenticated" });
        }
        try {
            const verified = verifyToken(token);
            if (!verified.scope.split(/\s+/).includes("outliner.read")) {
                logger.info({ event: "mcp_authentication_failed", requestId, reason: "insufficient_scope" });
                return void res.status(403).json({ error: "insufficient_scope" });
            }
            res.locals.mcpUid = verified.uid;
        } catch {
            logger.info({ event: "mcp_authentication_failed", requestId, reason: "invalid_token" });
            return void res.set("WWW-Authenticate", `${challenge()}, error="invalid_token"`).status(401).json({
                error: "invalid_token",
            });
        }
        next();
    });

    router.post("/mcp", async (req, res) => {
        const uid = res.locals.mcpUid as string;
        const requestId = res.locals.mcpRequestId as string;
        const grantedScopes = verifyToken(req.headers.authorization!.slice("Bearer ".length)).scope.split(/\s+/);
        const requireWrite = () => {
            if (!grantedScopes.includes("outliner.write")) {
                throw new McpReadError("forbidden", "The outliner.write scope is required");
            }
        };

        const mcp = new McpServer({ name: "outliner", version: "1.0.0" });
        const uidFingerprint = crypto.createHash("sha256").update(uid).digest("hex").slice(0, 12);
        const tool = <T extends z.ZodRawShape>(
            name: string,
            description: string,
            shape: T,
            handler: (args: z.infer<z.ZodObject<T>>) => Promise<unknown> | unknown,
            options: {
                annotations?: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; };
                /** Mutation tools get every attempt recorded to the audit log. */
                mutating?: boolean;
            } = {},
        ) => mcp.registerTool(
            name,
            { description, inputSchema: shape, annotations: options.annotations ?? readOnly },
            (async (args: unknown) => {
                const typedArgs = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
                const auditBase = {
                    requestId,
                    uidFingerprint,
                    tool: name,
                    projectId: typeof typedArgs.projectId === "string" ? typedArgs.projectId : undefined,
                    entity: typeof typedArgs.relation === "string"
                        ? typedArgs.relation
                        : typeof typedArgs.gridId === "string"
                        ? `grid:${typedArgs.gridId}`
                        : typeof typedArgs.viewId === "string"
                        ? `${typeof typedArgs.kind === "string" ? typedArgs.kind : "view"}:${typedArgs.viewId}`
                        : typeof typedArgs.tableId === "string"
                        ? `table:${typedArgs.tableId}`
                        : undefined,
                    operationId: typeof typedArgs.operationId === "string" ? typedArgs.operationId : undefined,
                    dryRun: typedArgs.dryRun === true,
                };
                try {
                    const result = await handler(args as z.infer<z.ZodObject<T>>);
                    if (options.mutating) {
                        const fields = result && typeof result === "object" ? result as Record<string, unknown> : {};
                        recordMcpAudit({
                            ...auditBase,
                            outcome: "success",
                            priorRevision: typeof fields.priorRevision === "string" ? fields.priorRevision : undefined,
                            newRevision: typeof fields.revision === "string" ? fields.revision : undefined,
                            applied: fields.applied !== false,
                            replayed: fields.replayed === true,
                        });
                    }
                    return response(result);
                } catch (error) {
                    if (error instanceof McpReadError) {
                        logger.info({
                            event: "mcp_resolution_failed",
                            requestId,
                            uidFingerprint,
                            code: error.code,
                            ...safeLogDiagnostics(error.debug),
                        }, error.message);
                        if (options.mutating) {
                            recordMcpAudit({ ...auditBase, outcome: error.code, applied: false, replayed: false });
                        }
                        return errorResponse(error.message, error.code, { requestId, ...error.debug });
                    }
                    logger.error({
                        event: "mcp_internal_error",
                        requestId,
                        uidFingerprint,
                        tool: name,
                    }, error instanceof Error ? error.message : String(error));
                    if (options.mutating) {
                        recordMcpAudit({ ...auditBase, outcome: "internal_failure", applied: false, replayed: false });
                    }
                    // Never forward an unexpected internal exception's message to the
                    // client: it may reveal implementation detail. It is fully logged
                    // above (mcp_internal_error) for server-side diagnosis.
                    return errorResponse("Internal error", "internal_failure", { requestId });
                }
            }) as never,
        );
        tool(
            "resolve_url",
            "Resolve a supported Outliner URL into stable IDs.",
            { url: z.string() },
            args => service.resolveUrl(uid, args.url),
        );
        tool(
            "get_item",
            "Read one semantic outline node.",
            { projectId: z.string(), itemId: z.string() },
            args => service.getItem(uid, args.projectId, args.itemId),
        );
        tool("get_subtree", "Read an ordered, bounded semantic subtree.", {
            projectId: z.string(),
            itemId: z.string(),
            depth: z.number().int().optional(),
            limit: z.number().int().optional(),
        }, args => service.getSubtree(uid, args.projectId, args.itemId, args.depth, args.limit));
        tool(
            "get_ancestors",
            "Read ancestors in root-to-target order.",
            { projectId: z.string(), itemId: z.string() },
            args => service.getAncestors(uid, args.projectId, args.itemId),
        );
        tool("search_items", "Search text nodes within one authorized project.", {
            projectId: z.string(),
            query: z.string(),
            limit: z.number().int().optional(),
        }, args => service.searchItems(uid, args.projectId, args.query, args.limit));
        tool("get_grid", "Read lightweight Grid metadata without materializing rows.", {
            projectId: z.string(),
            gridId: z.string(),
        }, args => service.getGrid(uid, args.projectId, args.gridId));
        tool("get_calendar", "Read lightweight Calendar metadata without materializing entries.", {
            projectId: z.string(),
            calendarId: z.string(),
        }, args => service.getCalendar(uid, args.projectId, args.calendarId));
        if (relationService) {
            tool("get_table", "Inspect bounded Table metadata, schema, and stable-id records.", {
                projectId: z.string(),
                tableId: z.string(),
                includeRecords: z.boolean().optional(),
                recordLimit: z.number().int().optional(),
                cursor: z.string().optional(),
            }, args =>
                relationService.getTable(
                    uid,
                    args.projectId,
                    args.tableId,
                    args.includeRecords,
                    args.recordLimit,
                    args.cursor,
                ));
            tool("trace_grid", "Inspect a bounded Grid query and its structured render provenance.", {
                projectId: z.string(),
                gridId: z.string(),
                maxRows: z.number().int().optional(),
            }, args => relationService.traceGrid(uid, args.projectId, args.gridId, args.maxRows));
            tool("validate_table_schema", "Dry-run a Table schema migration without changing project state.", {
                projectId: z.string(),
                tableId: z.string(),
                schemaSql: z.string(),
            }, args => relationService.validateTableSchema(uid, args.projectId, args.tableId, args.schemaSql));
            tool(
                "validate_grid_query",
                "Dry-run a Grid SELECT without changing its saved query or project state.",
                {
                    projectId: z.string(),
                    gridId: z.string(),
                    query: z.string(),
                    resultLimit: z.number().int().optional(),
                },
                args =>
                    relationService.validateGridQuery(uid, args.projectId, args.gridId, args.query, args.resultLimit),
            );
            tool("list_relations", "List SQL-visible relations in an authorized project.", {
                projectId: z.string(),
            }, args => relationService.listRelations(uid, args.projectId));
            tool("get_relation_schema", "Describe a relation's columns and write capabilities.", {
                projectId: z.string(),
                relation: z.string(),
            }, args => relationService.getRelationSchema(uid, args.projectId, args.relation));
            tool("query_sql", "Run one bounded, read-only SELECT over project relations.", {
                projectId: z.string(),
                sql: z.string(),
                maxRows: z.number().int().optional(),
            }, args => relationService.querySql(uid, args.projectId, args.sql, args.maxRows));
            const write = z.discriminatedUnion("op", [
                z.object({
                    op: z.literal("UPDATE"),
                    rowId: z.string(),
                    column: z.string(),
                    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
                }),
                z.object({
                    op: z.literal("INSERT"),
                    values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
                    destination: z.object({ parentKey: z.string() }).optional(),
                }),
                z.object({
                    op: z.literal("DELETE"),
                    rowId: z.string(),
                    disposition: z.enum(["delete-source", "clear-projected-field"]).optional(),
                }),
            ]);
            // Every mutation tool shares the same optimistic-concurrency
            // precondition (issue #5208): expectedRevision rejects a write
            // whose target changed since the caller last read it,
            // operationId makes a retried call idempotent, and dryRun
            // validates + checks the precondition without persisting.
            const precondition = {
                expectedRevision: z.string().optional(),
                operationId: z.string().min(1).max(200).optional(),
                dryRun: z.boolean().optional(),
            };
            tool(
                "write_relation",
                "Apply a structured mutation through the relation's Yjs write path.",
                {
                    projectId: z.string(),
                    relation: z.string(),
                    write,
                    ...precondition,
                },
                args => {
                    requireWrite();
                    return relationService.writeRelation(uid, args.projectId, args.relation, args.write, {
                        expectedRevision: args.expectedRevision,
                        operationId: args.operationId,
                        dryRun: args.dryRun,
                    });
                },
                {
                    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
                    mutating: true,
                },
            );
            tool(
                "update_grid_query",
                "Validate and safely update a Grid's saved read-only SELECT query.",
                {
                    projectId: z.string(),
                    gridId: z.string(),
                    query: z.string(),
                    expectedRevision: z.string(),
                    operationId: z.string().min(1).max(200).optional(),
                    dryRun: z.boolean().optional(),
                },
                args => {
                    requireWrite();
                    return relationService.updateGridQuery(uid, args.projectId, args.gridId, args.query, {
                        expectedRevision: args.expectedRevision,
                        operationId: args.operationId,
                        dryRun: args.dryRun,
                    });
                },
                {
                    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
                    mutating: true,
                },
            );
            tool(
                "set_view_query",
                "Set a Grid or Calendar's saved read-only SELECT.",
                {
                    projectId: z.string(),
                    kind: z.enum(["grid", "calendar"]),
                    viewId: z.string(),
                    query: z.string(),
                    ...precondition,
                },
                args => {
                    requireWrite();
                    return relationService.setViewQuery(uid, args.projectId, args.kind, args.viewId, args.query, {
                        expectedRevision: args.expectedRevision,
                        operationId: args.operationId,
                        dryRun: args.dryRun,
                    });
                },
                {
                    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
                    mutating: true,
                },
            );
            tool(
                "update_table_schema",
                "Migrate a Table's schema through the same dry-run validator as validate_table_schema. "
                    + "A migration that removes or retypes a column is destructive and is rejected with "
                    + "destructive_confirmation_required unless the call also sets acknowledgeDestructive: true; "
                    + "a dryRun call always reports the diff without needing it.",
                {
                    projectId: z.string(),
                    tableId: z.string(),
                    schemaSql: z.string(),
                    expectedRevision: z.string(),
                    acknowledgeDestructive: z.boolean().optional(),
                    operationId: z.string().min(1).max(200).optional(),
                    dryRun: z.boolean().optional(),
                },
                args => {
                    requireWrite();
                    return relationService.updateTableSchema(uid, args.projectId, args.tableId, args.schemaSql, {
                        expectedRevision: args.expectedRevision,
                        acknowledgeDestructive: args.acknowledgeDestructive,
                        operationId: args.operationId,
                        dryRun: args.dryRun,
                    });
                },
                {
                    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
                    mutating: true,
                },
            );
            tool(
                "update_table_records",
                "Update Table records by stable record ID in one atomic, all-or-nothing batch — never by "
                    + "displayed row index, and never creating a new record. Useful for populating a new ordering "
                    + "column across a bounded set of records, but rewriting values here does not change Grid "
                    + "display order; update the Grid's saved query (set_view_query/update_grid_query) for that.",
                {
                    projectId: z.string(),
                    tableId: z.string(),
                    expectedRevision: z.string(),
                    changes: z.array(z.object({
                        recordId: z.string(),
                        values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
                    })).min(1).max(100),
                    operationId: z.string().min(1).max(200).optional(),
                    dryRun: z.boolean().optional(),
                },
                args => {
                    requireWrite();
                    return relationService.updateTableRecords(uid, args.projectId, args.tableId, args.changes, {
                        expectedRevision: args.expectedRevision,
                        operationId: args.operationId,
                        dryRun: args.dryRun,
                    });
                },
                {
                    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
                    mutating: true,
                },
            );
        }

        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        try {
            await mcp.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            if (!res.headersSent) {
                const safe = error instanceof McpReadError ? error.message : "MCP request failed";
                res.status(error instanceof McpReadError && error.code === "forbidden" ? 403 : 400).json({
                    error: safe,
                });
            }
        } finally {
            await transport.close();
            await mcp.close();
        }
    });
    router.all("/mcp", (_req, res) => {
        res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" });
    });
    return router;
}
