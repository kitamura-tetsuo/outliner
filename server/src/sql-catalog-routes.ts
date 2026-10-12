import type { Hocuspocus } from "@hocuspocus/server";
import express from "express";
import { z } from "zod";
import { checkContainerAccess as defaultCheckAccess } from "./access-control.js";
import { logger } from "./logger.js";
import { McpReadError } from "./mcp/mcp-error.js";
import type { DocumentStore } from "./persistence.js";
import { SqlCatalogMutationService } from "./sql-catalog-service.js";
import { verifyIdTokenCached as defaultVerifyToken } from "./websocket-auth.js";

const CatalogObjectSchema = z.object({
    id: z.string().min(1).max(200),
    kind: z.literal("enum"),
    source: z.string().min(1).max(20000),
});

const CatalogIntentSchema = z.discriminatedUnion("operation", [
    z.object({ operation: z.literal("create"), object: CatalogObjectSchema }),
    z.object({ operation: z.literal("replace"), object: CatalogObjectSchema }),
    z.object({ operation: z.literal("delete"), objectId: z.string().min(1).max(200) }),
]);

const CatalogMutationSchema = z.object({
    projectId: z.string().min(1).max(128),
    expectedRevision: z.string().min(1),
    intent: CatalogIntentSchema,
});

/**
 * Authenticated browser transport for the Project SQL catalog (issue #5574).
 *
 * The SQL catalog panel must never publish Yjs updates directly: every read
 * and mutation travels this router, which authenticates the Firebase ID
 * token, rechecks project access, and delegates to the supplied
 * SqlCatalogMutationService. The service re-authorizes before publication,
 * so a grant revoked mid-flight is still refused.
 */
export function createSqlCatalogRouter(
    hocuspocus: Hocuspocus,
    storeDocument?: DocumentStore,
    overrides?: {
        checkContainerAccess?: typeof defaultCheckAccess;
        verifyIdTokenCached?: typeof defaultVerifyToken;
    },
) {
    const checkContainerAccess = overrides?.checkContainerAccess || defaultCheckAccess;
    const verifyIdTokenCached = overrides?.verifyIdTokenCached || defaultVerifyToken;
    const router = express.Router();

    const service = () => new SqlCatalogMutationService(hocuspocus, checkContainerAccess, storeDocument);

    async function authenticate(req: express.Request): Promise<string> {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            logger.warn({ event: "sql_catalog_unauthorized", reason: "missing_token" });
            throw new McpReadError("forbidden", "Unauthorized");
        }
        try {
            const decoded = await verifyIdTokenCached(authHeader.split(" ")[1]);
            return decoded.uid;
        } catch (error) {
            logger.warn({
                event: "sql_catalog_unauthorized",
                reason: "invalid_token",
                error: error instanceof Error ? error.message : String(error),
            });
            throw new McpReadError("forbidden", "Unauthorized");
        }
    }

    function authorizeProject(projectId: unknown): string {
        if (typeof projectId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) {
            throw new McpReadError("invalid_argument", "Invalid project ID");
        }
        return projectId;
    }

    async function authorizeAccess(uid: string, projectId: string): Promise<void> {
        let allowed = false;
        try {
            allowed = await checkContainerAccess(uid, projectId);
        } catch {
            allowed = false;
        }
        if (allowed !== true) {
            logger.warn({ event: "sql_catalog_forbidden", projectId, uid });
            throw new McpReadError("forbidden", "Forbidden: You do not have access to this project");
        }
    }

    function sendError(res: express.Response, error: unknown): void {
        if (error instanceof McpReadError) {
            const status = error.code === "forbidden"
                ? 403
                : error.code === "not_found"
                ? 404
                : error.code === "invalid_argument"
                ? 400
                : 500;
            const body: Record<string, unknown> = { error: error.message, code: error.code };
            res.status(status).json(body);
            return;
        }
        logger.error(
            { err: error instanceof Error ? { message: error.message, name: error.name } : error },
            "sql_catalog_error",
        );
        res.status(500).json({ error: "Internal Server Error" });
    }

    router.get("/sql-catalog/read", async (req, res) => {
        try {
            const uid = await authenticate(req);
            const projectId = authorizeProject(req.query.projectId);
            await authorizeAccess(uid, projectId);
            const snapshot = await service().read(uid, projectId);
            res.status(200).json({ snapshot });
        } catch (error) {
            const unauthorized = error instanceof McpReadError && error.message === "Unauthorized";
            if (unauthorized) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            sendError(res, error);
        }
    });

    router.post("/sql-catalog/validate", async (req, res) => {
        try {
            const uid = await authenticate(req);
            const parsed = CatalogMutationSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: "Invalid request body", details: parsed.error.format() });
                return;
            }
            const { projectId, expectedRevision, intent } = parsed.data;
            authorizeProject(projectId);
            await authorizeAccess(uid, projectId);
            const result = await service().validate(uid, projectId, { expectedRevision, intent });
            res.status(200).json({ result });
        } catch (error) {
            const unauthorized = error instanceof McpReadError && error.message === "Unauthorized";
            if (unauthorized) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            sendError(res, error);
        }
    });

    router.post("/sql-catalog/apply", async (req, res) => {
        try {
            const uid = await authenticate(req);
            const parsed = CatalogMutationSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: "Invalid request body", details: parsed.error.format() });
                return;
            }
            const { projectId, expectedRevision, intent } = parsed.data;
            authorizeProject(projectId);
            await authorizeAccess(uid, projectId);
            const result = await service().apply(uid, projectId, { expectedRevision, intent });
            res.status(200).json({ result });
        } catch (error) {
            const unauthorized = error instanceof McpReadError && error.message === "Unauthorized";
            if (unauthorized) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            sendError(res, error);
        }
    });

    return router;
}
