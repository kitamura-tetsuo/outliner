import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import crypto from "crypto";
import express from "express";
import * as z from "zod/v4";
import { getOAuthIssuer } from "../oauth/config.js";
import { verifyAccessToken } from "../oauth/tokens.js";
import { serverLogger as logger } from "../utils/log-manager.js";
import { McpReadError, OutlinerReadService } from "./outliner-read-service.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const response = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
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
        }
        : {};

export function createMcpRouter(
    service: OutlinerReadService,
    verifyToken: (token: string) => { uid: string; scope: string; } = verifyAccessToken,
    configuredIssuer?: string,
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
            scopes_supported: ["outliner.read"],
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

        const mcp = new McpServer({ name: "outliner", version: "1.0.0" });
        const tool = <T extends z.ZodRawShape>(
            name: string,
            description: string,
            shape: T,
            handler: (args: z.infer<z.ZodObject<T>>) => Promise<unknown> | unknown,
        ) => mcp.registerTool(
            name,
            { description, inputSchema: shape, annotations: readOnly },
            (async (args: unknown) => {
                try {
                    return response(await handler(args as z.infer<z.ZodObject<T>>));
                } catch (error) {
                    if (error instanceof McpReadError) {
                        logger.info({
                            event: "mcp_resolution_failed",
                            requestId,
                            uidFingerprint: crypto.createHash("sha256").update(uid).digest("hex").slice(0, 12),
                            code: error.code,
                            ...safeLogDiagnostics(error.debug),
                        }, error.message);
                        const errorCode = error.code === "invalid_argument"
                            ? ErrorCode.InvalidParams
                            : ErrorCode.InternalError;
                        throw new McpError(errorCode, error.message, error.debug);
                    }
                    throw error;
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
