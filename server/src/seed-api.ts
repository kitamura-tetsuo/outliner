import express from "express";
import * as Y from "yjs";
import { z } from "zod";
import { logger } from "./logger.js";
import {
    ensureProjectDescriptorForWrite,
    normalizeProjectTitle,
    type ProjectDescriptor,
    ProjectDirectoryError,
} from "./project-directory.js";
import { Project } from "./schema/app-schema.js";
import { verifyIdTokenCached } from "./websocket-auth.js";

// Use 'any' type for Hocuspocus to avoid ESM import issues
// The actual type is @hocuspocus/server.Hocuspocus
import { Hocuspocus } from "@hocuspocus/server";
type HocuspocusInstance = Hocuspocus;

export interface PageSeedData {
    name: string;
    lines?: string[];
}

export interface SeedRequest {
    projectName: string;
    pages: PageSeedData[];
}

const PageSeedSchema = z.object({
    name: z.string().min(1).max(100),
    lines: z.array(z.string().max(10000)).max(1000).optional(),
});

const SeedRequestSchema = z.object({
    projectName: z.string().min(1).max(255),
    pages: z.array(PageSeedSchema).max(50),
});

/**
 * Server-side seeding endpoint that directly manipulates Yjs documents
 * Uses Hocuspocus's openDirectConnection API for proper document lifecycle management.
 */
export function createSeedRouter(
    hocuspocus: HocuspocusInstance,
    dependencies: {
        ensureDescriptor?: (uid: string, projectId: string, title: string) => Promise<ProjectDescriptor>;
    } = {},
) {
    const router = express.Router();

    router.post("/seed", async (req, res): Promise<void> => {
        // Authentication Check
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            logger.warn({ event: "seed_unauthorized", reason: "missing_token" });
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        let uid: string;
        try {
            const token = authHeader.split(" ")[1];
            const decoded = await verifyIdTokenCached(token);
            uid = decoded.uid;
        } catch (e) {
            logger.warn({
                event: "seed_unauthorized",
                reason: "invalid_token",
                error: e instanceof Error ? e.message : String(e),
            });
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        try {
            const validationResult = SeedRequestSchema.safeParse(req.body);

            if (!validationResult.success) {
                logger.warn({
                    event: "seed_invalid_request",
                    errors: validationResult.error.format(),
                });
                res.status(400).json({
                    error: "Invalid request body",
                    details: validationResult.error.format(),
                });
                return;
            }

            let projectName: string;
            try {
                projectName = normalizeProjectTitle(validationResult.data.projectName);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Invalid project title";
                res.status(400).json({ error: message });
                return;
            }
            const { pages } = validationResult.data;

            logger.info({ event: "seed_request", projectName, pageCount: pages.length });

            // Use stable ID derived from project name (matches client's stableIdFromTitle in test mode)
            function stableIdFromTitle(title: string): string {
                let h = 2166136261 >>> 0; // FNV-1a basis
                for (let i = 0; i < title.length; i++) {
                    h ^= title.charCodeAt(i);
                    h = (h * 16777619) >>> 0;
                }
                const hex = h.toString(16);
                return `p${hex}`; // ensure starts with a letter; matches [A-Za-z0-9_-]+
            }

            const projectId = stableIdFromTitle(projectName);

            try {
                const ensureDescriptor = dependencies.ensureDescriptor ?? ensureProjectDescriptorForWrite;
                await ensureDescriptor(uid, projectId, projectName);
            } catch (authError) {
                if (authError instanceof ProjectDirectoryError) {
                    const status = authError.code === "forbidden"
                        ? 403
                        : authError.code === "title_conflict"
                        ? 409
                        : 400;
                    logger.warn({
                        event: "seed_descriptor_validation_failed",
                        reason: authError.code,
                        projectId,
                    });
                    res.status(status).json({ error: authError.message });
                    return;
                }
                logger.error({ error: authError as Error, event: "seed_auth_check_error" }, "seed_auth_check_error");
                res.status(500).json({ error: "Internal Server Error during authorization check" });
                return;
            }

            const projectRoom = `projects/${projectId}`;

            // Use Hocuspocus's official openDirectConnection API
            // This properly handles document lifecycle, caching, and sync
            const directConnection = await (hocuspocus as unknown as {
                openDirectConnection: (
                    room: string,
                    opts: unknown,
                ) => Promise<
                    {
                        document: import("yjs").Doc;
                        transact: (fn: (doc: import("yjs").Doc) => void) => Promise<void>;
                        disconnect: () => Promise<void>;
                    }
                >;
            }).openDirectConnection(projectRoom, {
                isSeeding: true,
            });

            try {
                const doc = directConnection.document;
                if (!doc) {
                    throw new Error("Failed to get document from direct connection");
                }

                // Use transact for proper change handling
                // Pages are stored directly within the single project document's YTree.
                await directConnection.transact((document: unknown) => {
                    const ydoc = document as unknown as Y.Doc;

                    // Project titles are resource-side metadata. Remove a legacy
                    // duplicate if this document predates the canonical directory.
                    const metadata = ydoc.getMap("metadata");
                    metadata.delete("title");
                });

                // Create Project wrapper for YTree access outside the transaction
                // because yjs-orderedtree relies on synchronous observeDeep callbacks
                // which are suspended during a transaction.
                const project = Project.fromDoc(doc as unknown as Y.Doc);

                // Create pages and add content
                for (const pageData of pages) {
                    logger.info({ event: "seed_page", pageName: pageData.name });

                    // Create page node directly in the YTree
                    const page = project.addPage(pageData.name, "seed-server");

                    // Add content items (lines) as children of the page
                    if (pageData.lines && pageData.lines.length > 0) {
                        const pageItems = page.items;

                        for (const line of pageData.lines) {
                            const item = pageItems.addNode("seed-server");
                            item.text = line;
                        }

                        logger.info({
                            event: "seed_items_added",
                            pageName: pageData.name,
                            itemCount: pageData.lines.length,
                        });
                    }
                }

                logger.info({ event: "seed_complete", projectName, pageCount: pages.length });
                res.json({ success: true, projectName, pageCount: pages.length });

                // Disconnect to trigger Hocuspocus persistence correctly
                // With @hocuspocus/server 4.2.0, disconnect() takes { unloadImmediately: false }
                // but since the typings are 'any', we can just await it.
                await directConnection.disconnect();
            } catch (e: unknown) {
                const transactError = e instanceof Error ? e : new Error(String(e));
                // If transaction fails, disconnect the connection
                await directConnection.disconnect();
                throw transactError;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            logger.error({ error: new Error(errorMessage), stack: errorStack, event: "seed_error" }, "seed_error");
            res.status(500).json({ error: "Seeding failed", message: errorMessage });
        }
    });

    return router;
}
