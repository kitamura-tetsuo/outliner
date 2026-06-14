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
                // In yjs-orderedtree 1.x, an empty tree might still have internal keys,
                // but for seeding purposes, if it has very few keys it's effectively empty.
                const isEmpty = orderedTree.size <= 1;

                const shouldReset = shouldResetDemo({ isEmpty, lastReset, templateVersion, now, force });

                if (shouldReset) {
                    logger.info({
                        event: "seed_demo_resetting",
                        lastReset,
                        templateVersion,
                        now,
                        force,
                        size: orderedTree.size,
                    });

                    const ydoc = doc as unknown as Y.Doc;

                    // Tear the tree down and re-create its root, capturing the Project
                    // wrapper for the populate step below.
                    //
                    // Three YTree quirks force this exact shape (clear, then atomic root
                    // re-init, then unbatched populate — each a separate transaction):
                    //   1. Atomic teardown + root re-init. #3020 rebuilds the root as a fresh
                    //      sequential write of this client (Project.fromDoc re-initializes the
                    //      YTree because the cleared orderedTree is empty). That root creation
                    //      is otherwise NOT transactional, so when this runs on the live demo
                    //      document a stale observeDeep handler — left attached by an earlier
                    //      Project.fromDoc() on the same doc — fires while "root" exists but its
                    //      "_parentHistory" has not been set yet, throwing
                    //      "Cannot read properties of undefined (reading 'entries')". Wrapping
                    //      the re-init in a transaction makes that observer fire once, after the
                    //      root is complete. (Repeated forced resets reproduce this; it is also
                    //      latent on @hocuspocus/server 3.x.)
                    let project!: Project;
                    // Clear in a transaction SEPARATE from the root re-init below. The two
                    // must not share a transaction: deleting and re-adding the "root" key in
                    // one transaction makes Yjs treat it as an update, which YTree rejects with
                    // "[ytree] The node should not be updated" (#3020 relies on root being a
                    // fresh add, not an update).
                    ydoc.transact(() => {
                        // Clear orderedTree completely
                        ydoc.getMap("orderedTree").clear();

                        // Clear items map completely (if it exists from previous versions)
                        ydoc.getMap("items").clear();

                        // Re-initialize metadata
                        const meta = ydoc.getMap("metadata");
                        meta.set("title", DEMO_PROJECT_TITLE);
                        meta.set("lastReset", now);
                        meta.set("templateVersion", DEMO_TEMPLATE_VERSION);
                    });

                    // Re-create the root atomically (its two internal writes batched), so a
                    // stale observer never sees a half-built root.
                    ydoc.transact(() => {
                        project = Project.fromDoc(ydoc);
                    });

                    //   2. Populate OUTSIDE that transaction. yjs-orderedtree relies on its
                    //      observeDeep handler firing between successive tree mutations to
                    //      refresh its internal computedMap; batching addPage/addNode
                    //      (createNode + setNodeOrderToEnd) into one transaction leaves new
                    //      nodes missing from that map and throws
                    //      "Cannot read properties of undefined (reading 'parent')". Each tree
                    //      write must therefore be its own transaction. (This is also why we no
                    //      longer use directConnection.transact(), which since 4.x wraps the
                    //      whole callback in one transaction.) directConnection.disconnect() in
                    //      the finally block persists the result.
                    populateDemoProject(project, "seed-server");

                    logger.info({ event: "seed_demo_populated", pages: project.items.length });
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
            logger.error(
                { error: new Error(errorMessage), event: "seed_demo_error" },
                "An error occurred during demo seeding",
            );
            res.status(500).json({ success: false, error: "Demo seeding failed", message: errorMessage });
        }
    });

    return router;
}
