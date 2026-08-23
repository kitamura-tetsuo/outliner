import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import * as z from "zod/v4";
import { verifyAccessToken } from "../oauth/tokens.js";
import { McpReadError, OutlinerReadService } from "./outliner-read-service.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const response = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

export function createMcpRouter(
    service: OutlinerReadService,
    verifyToken: (token: string) => { uid: string; } = verifyAccessToken,
) {
    const router = express.Router();
    router.all("/mcp", async (req, res) => {
        const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!token) return void res.status(401).json({ error: "unauthenticated" });
        let uid: string;
        try {
            uid = verifyToken(token).uid;
        } catch {
            return void res.status(401).json({ error: "invalid_token" });
        }

        const mcp = new McpServer({ name: "outliner", version: "1.0.0" });
        const tool = <T extends z.ZodRawShape>(
            name: string,
            description: string,
            shape: T,
            handler: (args: z.infer<z.ZodObject<T>>) => Promise<unknown> | unknown,
        ) => mcp.registerTool(
            name,
            { description, inputSchema: shape, annotations: readOnly },
            (async (args: unknown) => response(await handler(args as z.infer<z.ZodObject<T>>))) as never,
        );
        tool(
            "resolve_url",
            "Resolve a supported Outliner URL into stable IDs.",
            { url: z.string() },
            args => service.resolveUrl(args.url),
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
    return router;
}
