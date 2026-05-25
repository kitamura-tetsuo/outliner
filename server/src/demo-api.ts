import express from "express";
import fs from "fs";
import path from "path";
import * as Y from "yjs";
import { logger } from "./logger.js";
import { Project } from "./schema/app-schema.js";

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

                if (!lastReset || (now - lastReset > RESET_INTERVAL_MS)) {
                    shouldReset = true;
                }

                if (shouldReset) {
                    logger.info({ event: "seed_demo_resetting", lastReset, now });

                    // Read template
                    let templateLines: string[] = [];
                    try {
                        // Find docs relative to current file to be more robust
                        const docsDir = path.resolve(__dirname, "../../docs");
                        const templatePath = path.resolve(docsDir, "demo-template.txt");
                        const templateContent = fs.readFileSync(templatePath, "utf-8");
                        templateLines = templateContent.split("\n");
                    } catch (e) {
                        logger.warn({ event: "seed_demo_template_not_found", error: String(e) });
                        templateLines = [
                            "Welcome to the Outliner Demo!",
                            "This demo resets every 24 hours.",
                        ];
                    }

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
                        meta.set("title", "Demo Project");
                        meta.set("lastReset", now);

                        // Create project wrapper and root page
                        const tempProject = Project.createInstance("Demo Project");
                        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(tempProject.ydoc));

                        const project = Project.fromDoc(ydoc);
                        const page = project.addPage("Demo", "seed-server");

                        if (templateLines.length > 0) {
                            const pageItems = page.items;
                            for (const line of templateLines) {
                                const item = pageItems.addNode("seed-server");
                                item.text = line;
                            }
                        }
                    });
                } else {
                    logger.info({ event: "seed_demo_no_reset_needed", lastReset, now });
                }

                res.json({ success: true, reset: shouldReset });
            } finally {
                // Must disconnect to prevent memory leak
                await directConnection.disconnect();
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ event: "seed_demo_error", error: errorMessage });
            res.status(500).json({ error: "Demo seeding failed", message: errorMessage });
        }
    });

    return router;
}
