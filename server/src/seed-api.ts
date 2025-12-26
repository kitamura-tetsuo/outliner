import express from "express";
import type { LeveldbPersistence } from "y-leveldb";
import * as Y from "yjs";
import { Project } from "./app-schema.js";
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

                // Add lines to the page subdocument
                if (pageData.lines && pageData.lines.length > 0) {
                    for (const line of pageData.lines) {
                        const item = page.items.addNode("seed-server");
                        item.updateText(line);
                    }

                    // Get the subdocument for this page
                    const pages = projectDoc.getMap<Y.Doc>("pages");
                    const subdoc = pages.get(page.id);

                    if (subdoc) {
                        // Persist the subdocument
                        const pageRoom = `projects/${projectId}/pages/${page.id}`;
                        const subdocUpdate = Y.encodeStateAsUpdate(subdoc);
                        await persistence.storeUpdate(pageRoom, subdocUpdate);
                        logger.info({ event: "seed_subdoc_persisted", pageRoom, bytes: subdocUpdate.byteLength });
                    }
                }
            }

            // Persist the main project document
            const projectUpdate = Y.encodeStateAsUpdate(projectDoc);
            await persistence.storeUpdate(projectRoom, projectUpdate);
            logger.info({ event: "seed_project_persisted", projectRoom, bytes: projectUpdate.byteLength });

            logger.info({ event: "seed_complete", projectName });
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
