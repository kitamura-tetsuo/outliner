import express from "express";
import * as Y from "yjs";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION, populateDemoProject } from "./demo-content.js";
import { logger } from "./logger.js";
import { Project } from "./schema/app-schema.js";

type HocuspocusInstance = any;

const DEMO_PROJECT_ID = "demo";
const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DemoResetState {
    isEmpty: boolean;
    lastReset: number | undefined;
    templateVersion: number | undefined;
    now: number;
    force: boolean;
}

// Decide whether the shared demo document must be re-seeded. `force` is the
// manual trigger of the same reset that otherwise runs on the 24h schedule.
export function shouldResetDemo(state: DemoResetState): boolean {
    return state.force
        || state.isEmpty
        || !state.lastReset
        || (state.now - state.lastReset > RESET_INTERVAL_MS)
        || state.templateVersion !== DEMO_TEMPLATE_VERSION;
}

export function createDemoRouter(hocuspocus: HocuspocusInstance) {
    const router = express.Router();

    router.post("/seed-demo", async (req, res): Promise<void> => {
        try {
            const force = req.body?.force === true;
            logger.info({ event: "seed_demo_request", force });

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

                const now = Date.now();

                const metadata = doc.getMap("metadata") as Y.Map<any>;
                const lastReset = metadata.get("lastReset") as number | undefined;
                const templateVersion = metadata.get("templateVersion") as number | undefined;

                const orderedTree = doc.getMap("orderedTree");
                const keys = Array.from(orderedTree.keys());
                const isEmpty = keys.length === 0 || (keys.length === 1 && keys[0] === "root");

                const shouldReset = shouldResetDemo({ isEmpty, lastReset, templateVersion, now, force });

                if (shouldReset) {
                    logger.info({ event: "seed_demo_resetting", lastReset, templateVersion, now, force });

                    await directConnection.transact((document: any) => {
                        const ydoc = document as unknown as Y.Doc;

                        // Clear orderedTree completely, except for the 'root' key
                        const orderedTree = ydoc.getMap("orderedTree");
                        Array.from(orderedTree.keys()).forEach(key => {
                            if (key !== "root") orderedTree.delete(key);
                        });

                        // Clear items map completely
                        const itemsMap = ydoc.getMap("items");
                        Array.from(itemsMap.keys()).forEach(key => itemsMap.delete(key));

                        // Re-initialize metadata
                        const meta = ydoc.getMap("metadata");
                        meta.set("title", DEMO_PROJECT_TITLE);
                        meta.set("lastReset", now);
                        meta.set("templateVersion", DEMO_TEMPLATE_VERSION);

                        // Rebuild the template directly in the live document.
                        // The orderedTree map is empty at this point, so
                        // Project.fromDoc re-initializes the YTree as a
                        // sequential write of this client (see demo-content.ts
                        // for why applying a fresh doc's update is unsafe).
                        const project = Project.fromDoc(ydoc);
                        populateDemoProject(project, "seed-server");
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
