import express from "express";
import type { LeveldbPersistence } from "y-leveldb";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Items, Project } from "./app-schema.js";
import { logger } from "./logger.js";

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
 * This bypasses WebSocket synchronization timing issues by using the exact
 * same schema as the client.
 */
export function createSeedRouter(persistence: LeveldbPersistence | undefined) {
    const router = express.Router();

    router.post("/seed", async (req, res): Promise<void> => {
        if (!persistence) {
            res.status(503).json({ error: "Persistence not enabled" });
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
            const projectDoc = await persistence.getYDoc(projectRoom);

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
                const page = project.addPage(pageData.name, "seed-server");

                // Store items in the page subdocument's pageItems map
                // This matches how the client schema expects items to be stored
                if (pageData.lines && pageData.lines.length > 0) {
                    const pagesMap = projectDoc.getMap<Y.Doc>("pages");
                    const subdoc = pagesMap.get(page.id);

                    if (subdoc) {
                        // Ensure subdoc is loaded before accessing its data
                        subdoc.load();

                        const orderedTree = subdoc.getMap("orderedTree");
                        const tree = new YTree(orderedTree);
                        const pageItems = new Items(subdoc, tree, "root");

                        for (const line of pageData.lines) {
                            const newItem = pageItems.addNode("seed-server");
                            newItem.text = line;
                        }

                        // CRITICAL: Persist the subdocument to LevelDB
                        const pageRoom = `projects/${projectId}/pages/${page.id}`;
                        const subdocUpdate = Y.encodeStateAsUpdate(subdoc);
                        await persistence.storeUpdate(pageRoom, subdocUpdate);
                        logger.info({
                            event: "seed_items_persisted",
                            pageRoom,
                            bytes: subdocUpdate.byteLength,
                            itemCount: pageData.lines.length,
                        });
                    } else {
                        logger.warn({
                            event: "seed_subdoc_not_found",
                            pageId: page.id,
                            pageName: pageData.name,
                        });
                    }
                }
            }

            // Persist the main project document
            const projectUpdate = Y.encodeStateAsUpdate(projectDoc);
            await persistence.storeUpdate(projectRoom, projectUpdate);

            // Debug: Verify the persisted state by reading it back
            const verifyDoc = await persistence.getYDoc(projectRoom);
            const orderedTree = verifyDoc.getMap("orderedTree");
            logger.info({
                event: "seed_project_persisted",
                projectRoom,
                bytes: projectUpdate.byteLength,
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
