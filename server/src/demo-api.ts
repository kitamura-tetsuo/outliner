import { Hocuspocus } from "@hocuspocus/server";
import express from "express";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION, demoPages, populateDemoProject } from "./demo-content.js";
import { logger } from "./logger.js";
import { Project } from "./schema/app-schema.js";
import { getClientIp } from "./utils/ip.js";

type HocuspocusInstance = Hocuspocus;

const DEMO_PROJECT_ID = "demo";
const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FORCE_RESET_RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

const inFlightResets = new Map<string, Promise<{ success: boolean; reset: boolean; }>>();
const forceRateLimits = new Map<string, number>();

export interface DemoResetState {
    isEmpty: boolean;
    lastReset: number | undefined;
    templateVersion: number | undefined;
    now: number;
    force: boolean;
    missingTemplatePages: boolean;
}

// Decide whether the shared demo document must be re-seeded. `force` is the
// manual trigger of the same reset that otherwise runs on the 24h schedule.
export function shouldResetDemo(state: DemoResetState): boolean {
    return state.force
        || state.isEmpty
        || !state.lastReset
        || (state.now - state.lastReset > RESET_INTERVAL_MS)
        || state.templateVersion !== DEMO_TEMPLATE_VERSION
        || state.missingTemplatePages;
}

export function createDemoRouter(hocuspocus: HocuspocusInstance) {
    const router = express.Router();

    router.post("/seed-demo", async (req, res): Promise<void> => {
        try {
            const force = req.body?.force === true;
            logger.info({ event: "seed_demo_request", force });

            if (force) {
                const clientIp = getClientIp(req);
                const now = Date.now();
                for (const [ip, time] of forceRateLimits.entries()) {
                    if (now - time > FORCE_RESET_RATE_LIMIT_MS) {
                        forceRateLimits.delete(ip);
                    }
                }
                const lastForce = forceRateLimits.get(clientIp) || 0;
                if (now - lastForce < FORCE_RESET_RATE_LIMIT_MS) {
                    logger.warn({ event: "seed_demo_rate_limit_exceeded", ip: clientIp });
                    res.status(429).json({ error: "Too Many Requests", message: "Force reset is rate limited" });
                    return;
                }
                forceRateLimits.set(clientIp, now);
            }

            const projectRoom = `projects/${DEMO_PROJECT_ID}`;

            if (inFlightResets.has(projectRoom)) {
                logger.info({ event: "seed_demo_inflight_wait", projectRoom });
                const result = await inFlightResets.get(projectRoom);
                res.json({ success: true, reset: false, inFlightResult: result });
                return;
            }

            const resetPromise = (async () => {
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

                    const metadata = doc.getMap("metadata") as Y.Map<unknown>;
                    const lastReset = metadata.get("lastReset") as number | undefined;
                    const templateVersion = metadata.get("templateVersion") as number | undefined;

                    const orderedTree = doc.getMap("orderedTree") as Y.Map<unknown>;
                    const keys = Array.from(orderedTree.keys());
                    const isEmpty = keys.length === 0 || (keys.length === 1 && keys[0] === "root");

                    // Check if any required template page title is missing or renamed
                    let missingTemplatePages = false;
                    if (!isEmpty) {
                        const expectedTitles = new Set(demoPages.map(p => p.title.trim().toLowerCase()));
                        const existingTitles = new Set<string>();

                        // We read directly from the underlying Y.Map to prevent YTree observer memory leaks
                        const treeMap = doc.getMap("orderedTree") as Y.Map<unknown>;
                        for (const key of treeMap.keys()) {
                            if (key === "root" || key === "deleted") continue;
                            const nodeMap = treeMap.get(key) as Y.Map<unknown> | undefined;
                            if (
                                nodeMap && nodeMap.get("_parentHistory") instanceof Y.Map
                                && (nodeMap.get("_parentHistory") as Y.Map<unknown>).has("root")
                            ) {
                                const valueMap = nodeMap.get("value") as Y.Map<unknown> | undefined;
                                if (valueMap && valueMap.has("text")) {
                                    const text = valueMap.get("text") as Y.Text | undefined;
                                    if (text) {
                                        existingTitles.add(text.toString().trim().toLowerCase());
                                    }
                                }
                            }
                        }

                        for (const expected of expectedTitles) {
                            if (!existingTitles.has(expected)) {
                                missingTemplatePages = true;
                                break;
                            }
                        }
                    }

                    const shouldReset = shouldResetDemo({
                        isEmpty,
                        lastReset,
                        templateVersion,
                        now,
                        force,
                        missingTemplatePages,
                    });

                    if (shouldReset) {
                        logger.info({ event: "seed_demo_resetting", lastReset, templateVersion, now, force });

                        const docProject = Project.fromDoc(doc as unknown as Y.Doc);

                        await directConnection.transact((document: unknown) => {
                            const ydoc = document as unknown as Y.Doc;
                            const meta = ydoc.getMap("metadata");
                            meta.set("isResetting", true);
                        });

                        try {
                            // We do not use transact() for massive deletion because it bypasses the wrapper
                            // and causes observers on connected clients to crash.
                            // Instead, safely delete items one by one using the wrapper API.
                            const rootItems = docProject.items;
                            if (rootItems) {
                                for (let i = rootItems.length - 1; i >= 0; i--) {
                                    const child = rootItems.at(i);
                                    if (child) {
                                        child.delete();
                                    }
                                }
                            }

                            await directConnection.transact((document: unknown) => {
                                const ydoc = document as unknown as Y.Doc;

                                // Clear items map of any orphaned nodes completely
                                const orderedTreeMap = ydoc.getMap("orderedTree");
                                const itemsMap = ydoc.getMap("items");
                                Array.from(itemsMap.keys()).forEach(key => {
                                    if (!orderedTreeMap.has(key)) {
                                        itemsMap.delete(key);
                                    }
                                });

                                // Re-initialize metadata
                                const meta = ydoc.getMap("metadata");
                                meta.set("title", DEMO_PROJECT_TITLE);
                                meta.set("lastReset", now);
                                meta.set("templateVersion", DEMO_TEMPLATE_VERSION);
                            });

                            // Rebuild the template directly in the live document.
                            // This is done sequentially outside the transaction because
                            // yjs-orderedtree relies on synchronous observeDeep callbacks
                            // which are suspended during a transaction.
                            populateDemoProject(docProject, "seed-server");
                        } finally {
                            await directConnection.transact((document: unknown) => {
                                const ydoc = document as unknown as Y.Doc;
                                const meta = ydoc.getMap("metadata");
                                meta.set("isResetting", false);
                            });
                        }
                    } else {
                        logger.info({ event: "seed_demo_no_reset_needed", lastReset, templateVersion, now });
                    }

                    return { success: true, reset: shouldReset };
                } finally {
                    // Must disconnect to prevent memory leak
                    await directConnection.disconnect();
                }
            })();

            inFlightResets.set(projectRoom, resetPromise);
            try {
                const result = await resetPromise;
                res.json(result);
            } finally {
                inFlightResets.delete(projectRoom);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: new Error(errorMessage), event: "seed_demo_error" }, "An error occurred");
            res.status(500).json({ error: "Demo seeding failed", message: errorMessage });
        }
    });

    return router;
}
