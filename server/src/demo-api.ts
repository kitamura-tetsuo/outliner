import express from "express";
import * as Y from "yjs";
import { buildDemoProject, DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION } from "./demo-content.js";
import { logger } from "./logger.js";

type HocuspocusInstance = any;

const DEMO_PROJECT_ID = "demo";
const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createDemoRouter(hocuspocus: HocuspocusInstance) {
    const router = express.Router();

    router.post("/seed-demo", async (req, res): Promise<void> => {
        try {
            logger.info({ event: "seed_demo_request" });

            const projectRoom = `projects/${DEMO_PROJECT_ID}`;

            // Connect to demo document
            const directConnection = await hocuspocus.openDirectConnection(projectRoom, {
                isSeeding: true,
            });

            try {
                const doc = directConnection.document;
                if (!doc) {
                    throw new Error("Failed to get document from direct connection");
                }

                let shouldReset = false;
                const now = Date.now();

                const metadata = doc.getMap("metadata") as Y.Map<any>;
                const lastReset = metadata.get("lastReset") as number | undefined;
                const templateVersion = metadata.get("templateVersion") as number | undefined;

                const orderedTree = doc.getMap("orderedTree");
                const keys = Array.from(orderedTree.keys());
                const isEmpty = keys.length === 0 || (keys.length === 1 && keys[0] === "root");

                if (
                    isEmpty
                    || !lastReset
                    || (now - lastReset > RESET_INTERVAL_MS)
                    || templateVersion !== DEMO_TEMPLATE_VERSION
                ) {
                    shouldReset = true;
                }

                if (shouldReset) {
                    logger.info({ event: "seed_demo_resetting", lastReset, templateVersion, now });

                    await directConnection.transact((document: any) => {
                        const ydoc = document as unknown as Y.Doc;

                        // Clear orderedTree completely
                        const orderedTree = ydoc.getMap("orderedTree");
                        Array.from(orderedTree.keys()).forEach(key => orderedTree.delete(key));

                        // Clear items map completely
                        const itemsMap = ydoc.getMap("items");
                        Array.from(itemsMap.keys()).forEach(key => itemsMap.delete(key));

                        // Re-initialize metadata
                        const meta = ydoc.getMap("metadata");
                        meta.set("title", DEMO_PROJECT_TITLE);
                        meta.set("lastReset", now);
                        meta.set("templateVersion", DEMO_TEMPLATE_VERSION);

                        // Build the full demo project (all feature pages) in a
                        // temporary valid instance first
                        const tempProject = buildDemoProject("seed-server");

                        // Apply the properly initialized project document into the real shared document
                        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(tempProject.ydoc));
                    });
                } else {
                    logger.info({ event: "seed_demo_no_reset_needed", lastReset, templateVersion, now });
                }

                res.json({ success: true, reset: shouldReset });
            } finally {
                // Must disconnect to prevent memory leak
                await directConnection.disconnect();
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: new Error(errorMessage), event: "seed_demo_error" }, "An error occurred");
            res.status(500).json({ error: "Demo seeding failed", message: errorMessage });
        }
    });

    return router;
}
