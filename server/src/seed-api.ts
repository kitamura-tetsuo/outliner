import express from "express";
import * as Y from "yjs";
import { logger } from "./logger.js";
import { Project } from "./schema/app-schema.js";
import { verifyIdTokenCached } from "./websocket-auth.js";

// Use 'any' type for Hocuspocus to avoid ESM import issues
// The actual type is @hocuspocus/server.Hocuspocus
type HocuspocusInstance = any;

export interface PageSeedData {
    name: string;
    lines?: string[];
}

export interface SeedRequest {
    projectName: string;
    pages: PageSeedData[];
}

/**
 * Server-side seeding endpoint that directly manipulates Yjs documents
 * Uses Hocuspocus's openDirectConnection API for proper document lifecycle management.
 */
export function createSeedRouter(
    hocuspocus: HocuspocusInstance,
    // persistence argument removed as it's not used here anymore and type was y-leveldb
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

        try {
            const token = authHeader.split(" ")[1];
            await verifyIdTokenCached(token);
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
            const { projectName, pages }: SeedRequest = req.body;

            if (!projectName || !pages || !Array.isArray(pages)) {
                res.status(400).json({ error: "Invalid request body" });
                return;
            }

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
            const projectRoom = `projects/${projectId}`;

            // Use Hocuspocus's official openDirectConnection API
            // This properly handles document lifecycle, caching, and sync
            const directConnection = await (hocuspocus as any).openDirectConnection(projectRoom, {
                isSeeding: true,
            });

            try {
                const doc = directConnection.document;
                if (!doc) {
                    throw new Error("Failed to get document from direct connection");
                }

                // Use transact for proper change handling
                // IMPORTANT: We avoid using Project.addPage because it creates subdocuments
                // with subdoc.load() which doesn't work correctly with Hocuspocus's Document class.
                // Instead, we create pages directly in the orderedTree without subdocuments.
                await directConnection.transact((document: any) => {
                    const ydoc = document as unknown as Y.Doc;

                    // Set project title directly in metadata
                    const metadata = ydoc.getMap("metadata");
                    if (!metadata.get("title")) {
                        metadata.set("title", projectName);
                    }

                    // Create Project wrapper for YTree access
                    const project = Project.fromDoc(ydoc);
                    const items = project.items; // Items wrapper for YTree

                    // Create pages and add content
                    for (const pageData of pages) {
                        logger.info({ event: "seed_page", pageName: pageData.name });

                        // Create page node directly using Items.addNode (avoids subdoc creation)
                        // This creates a node in the YTree with the page name as text
                        const page = items.addNode("seed-server");
                        page.updateText(pageData.name);

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
                });

                logger.info({ event: "seed_complete", projectName, pageCount: pages.length });
                res.json({ success: true, projectName, pageCount: pages.length });

                // Keep the connection open to allow clients to connect and sync
                // The document will be properly managed by Hocuspocus
                // We don't disconnect immediately to ensure the document stays in memory
                // for when the client connects
                logger.info({ event: "seed_connection_kept_open", projectRoom });
            } catch (transactError: any) {
                // If transaction fails, disconnect the connection
                await directConnection.disconnect();
                throw transactError;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            logger.error({ event: "seed_error", error: errorMessage, stack: errorStack });
            res.status(500).json({ error: "Seeding failed", message: errorMessage });
        }
    });

    return router;
}
