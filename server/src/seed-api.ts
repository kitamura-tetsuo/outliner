import express from "express";
import type { LeveldbPersistence } from "y-leveldb";
import * as Y from "yjs";
import { logger } from "./logger.js";
import { Project } from "./schema/app-schema.js";
import { verifyIdTokenCached } from "./websocket-auth.js";

export interface PageSeedData {
    name: string;
    lines?: string[];
}

export interface SeedRequest {
    projectName: string;
    pages: PageSeedData[];
}

interface GetYDoc {
    (docname: string, gc?: boolean): Y.Doc;
}

/**
 * Server-side seeding endpoint that directly manipulates Yjs documents
 * This bypasses WebSocket synchronization timing issues by using the exact
 * same schema as the client.
 */
export function createSeedRouter(persistence: LeveldbPersistence | undefined, getYDoc?: GetYDoc) {
    const router = express.Router();

    router.post("/seed", async (req, res): Promise<void> => {
        if (!persistence) {
            res.status(503).json({ error: "Persistence not enabled" });
            return;
        }

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

            // Get or create the project document using stable ID (same as client)
            const projectId = stableIdFromTitle(projectName);
            const projectRoom = `projects/${projectId}`;

            let projectDoc: Y.Doc;
            if (getYDoc) {
                // Use live doc from y-websocket memory cache!
                projectDoc = getYDoc(projectRoom);
                // Wait for initialization if needed (WSSharedDoc pattern)
                if ((projectDoc as any).whenInitialized) {
                    await (projectDoc as any).whenInitialized;
                }
            } else {
                // Fallback (risk of desync)
                projectDoc = await persistence.getYDoc(projectRoom);
            }

            // Use the actual Project schema from client
            const project = Project.fromDoc(projectDoc);

            // Set project title
            if (!project.title) {
                project.title = projectName;
            }

            // Create pages and add content
            for (const pageData of pages) {
                logger.info({ event: "seed_page", pageName: pageData.name });

                // Add page to project using the real schema
                // project.addPage creates the page node in the main tree and manages the subdoc entry
                const page = project.addPage(pageData.name, "seed-server");

                // Add content items (lines) to the page
                // We use page.items.addNode() effectively adding children in the main OrderTree
                if (pageData.lines && pageData.lines.length > 0) {
                    const items = page.items; // Items wrapper for this page

                    for (const line of pageData.lines) {
                        const item = items.addNode("seed-server");
                        item.text = line;
                    }

                    logger.info({
                        event: "seed_items_added",
                        pageName: pageData.name,
                        itemCount: pageData.lines.length,
                    });
                }

                // If project.addPage creates a subdoc, we might want to fail-safe persist it or ignore if empty
                // The shared app-schema addPage puts a subdoc in the 'pages' map.
                // We'll persist that subdoc just in case, though content is now in the main doc.
                // (Optional: inspect if app-schema puts anything critical in subdoc)
                // App-schema:
                //   const subdoc = new Y.Doc({ guid: page.id, parent: this.ydoc } as YDocOptions);
                //   pages.set(page.id, subdoc);
                // It's mostly a placeholder for now.

                // We should ensure the subdoc is persisted if it exists, to match system expectations
                const pagesMap = projectDoc.getMap<Y.Doc>("pages");
                const subdoc = pagesMap.get(page.id);
                if (subdoc) {
                    const pageRoom = `projects/${projectId}/pages/${page.id}`;
                    const subdocUpdate = Y.encodeStateAsUpdate(subdoc);
                    await (persistence as any).storeUpdate(pageRoom, subdocUpdate);
                }
            }

            // Persist the main project document MANUALLY only if not using live doc binding
            // Persist the main project document MANUALLY to ensure LevelDB is populated.
            // This is critical because if no WebSocket client is connected yet, the live doc
            // is not bound to persistence, so edits remain memory-only until a client connects.
            let projectUpdate: Uint8Array | undefined;
            {
                projectUpdate = Y.encodeStateAsUpdate(projectDoc);
                await (persistence as any).storeUpdate(projectRoom, projectUpdate);
            }

            // Debug: Verify the persisted state by reading it back
            const verifyDoc = await persistence.getYDoc(projectRoom);
            const orderedTree = verifyDoc.getMap("orderedTree");
            logger.info({
                event: "seed_project_persisted",
                projectRoom,
                bytes: projectUpdate?.byteLength ?? 0,
                orderedTreeSize: orderedTree.size,
                expectedPages: pages.length,
            });

            logger.info({ event: "seed_complete", projectName, pageCount: pages.length });
            res.json({ success: true, projectName, pageCount: pages.length });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            logger.error({ event: "seed_error", error: errorMessage, stack: errorStack });
            res.status(500).json({ error: "Seeding failed", message: errorMessage });
        }
    });

    return router;
}
