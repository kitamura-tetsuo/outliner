import { Hocuspocus } from "@hocuspocus/server";
import cors from "cors";
import express from "express";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { type Config } from "./config.js";
import {
    DEMO_TEMPLATE_REVISION,
    demoPagesFor,
    demoTablesFor,
    populateDemoProject,
    seedDemoTableDoc,
} from "./demo-content.js";
import { DEFAULT_DEMO_SLUG, demoLocaleForSlug, isDemoProjectSlug } from "./demo-projects.js";
import { logger } from "./logger.js";
import { Project } from "./schema/app-schema.js";
import { getClientIp } from "./utils/ip.js";

type HocuspocusInstance = Hocuspocus;

const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FORCE_RESET_RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

// Every piece of per-demo state below is keyed by room (`projects/<slug>`), so
// the locales stay independent: reseeding `/demo` must not invalidate, block or
// rate-limit `/demo-ja`, and vice versa.
const inFlightResets = new Map<string, Promise<{ success: boolean; reset: boolean; }>>();
// Keyed by `<ip>|<project>` so one visitor forcing a reset of one locale does
// not lock them out of the others.
const forceRateLimits = new Map<string, number>();
const lastGlobalForceResets = new Map<string, number>();

const demoFastPaths = new Map<string, { stateVectorHex: string; missingTemplatePages: boolean; }>();

// How long a "template is fresh" verdict may be reused without re-opening the
// demo document. The verdict is additionally invalidated the moment the demo
// document changes (see rememberDemoWarmState), so this is only a backstop for
// state we can no longer observe.
const WARM_PATH_TTL_MS = 5 * 60 * 1000;

interface DemoWarmState {
    lastReset: number;
    templateRevision: string;
    verifiedAt: number;
    doc: Y.Doc;
    onDocChanged: () => void;
}

// Authoritative "nothing to do" state, per demo room. While a room's entry is
// set, a non-forced POST /api/seed-demo for that room answers without opening a
// direct connection, loading the document from storage, or scanning the tree.
const demoWarmStates = new Map<string, DemoWarmState>();

/** Drop the warm verdict of one room, or of every room when `room` is omitted. */
function clearDemoWarmState(room?: string): void {
    const rooms = room === undefined ? [...demoWarmStates.keys()] : [room];
    for (const key of rooms) {
        const state = demoWarmStates.get(key);
        if (!state) continue;
        demoWarmStates.delete(key);
        try {
            state.doc.off("update", state.onDocChanged);
            state.doc.off("destroy", state.onDocChanged);
        } catch (_e) {
            // The document may already be destroyed; nothing left to detach.
        }
    }
}

// Remember that `doc` currently holds a complete, up-to-date template. Any
// update to the document (an edit by a visitor, a rename, a page deletion) or
// unloading it from memory drops the verdict, so the next request revalidates.
function rememberDemoWarmState(
    room: string,
    doc: Y.Doc,
    lastReset: number,
    templateRevision: string,
    now: number,
): void {
    clearDemoWarmState(room);
    const onDocChanged = () => clearDemoWarmState(room);
    demoWarmStates.set(room, { lastReset, templateRevision, verifiedAt: now, doc, onDocChanged });
    doc.on("update", onDocChanged);
    doc.on("destroy", onDocChanged);
}

// True when the last validation proved the template is fresh and nothing has
// happened since that could invalidate it (including crossing the 24h reset
// boundary or a template version bump after a deploy).
export function isDemoWarm(room: string, now: number): boolean {
    const state = demoWarmStates.get(room);
    if (!state) return false;
    if (state.templateRevision !== DEMO_TEMPLATE_REVISION) return false;
    if (now - state.verifiedAt > WARM_PATH_TTL_MS) return false;
    if (now - state.lastReset > RESET_INTERVAL_MS) return false;
    return true;
}

/**
 * Drop the warm-path verdict. Exported so tests can start from a cold server;
 * with no argument it clears every demo room, which is what a test wants.
 */
export function resetDemoWarmState(room?: string): void {
    clearDemoWarmState(room);
}

export interface DemoResetState {
    isEmpty: boolean;
    lastReset: number | undefined;
    templateRevision: string | number | undefined;
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
        || state.templateRevision !== DEMO_TEMPLATE_REVISION
        || state.missingTemplatePages;
}

export function createDemoRouter(hocuspocus: HocuspocusInstance, config: Config) {
    const router = express.Router();

    router.use(cors({ origin: true, credentials: true }));
    router.options("/seed-demo", cors({ origin: true, credentials: true }));

    router.post("/seed-demo", async (req, res): Promise<void> => {
        const requestStartedAt = Date.now();
        const reportTiming = (phase: string) => {
            res.setHeader("Server-Timing", `demo-seed;dur=${Date.now() - requestStartedAt};desc="${phase}"`);
        };
        try {
            const force = req.body?.force === true;
            // Older clients predate the multilingual demo and send no project;
            // they mean the English one.
            const project = typeof req.body?.project === "string" ? req.body.project : DEFAULT_DEMO_SLUG;
            logger.info({ event: "seed_demo_request", force, project });

            // This endpoint is unauthenticated: without an exact-match check on
            // a registered slug it would open and rewrite any Hocuspocus room a
            // caller names.
            if (!isDemoProjectSlug(project)) {
                logger.warn({ event: "seed_demo_unknown_project", project });
                res.status(400).json({
                    error: "Bad Request",
                    message: "Unknown demo project",
                });
                return;
            }
            const locale = demoLocaleForSlug(project)!;
            const projectRoom = `projects/${project}`;

            let rateLimitKeyForForce: string | undefined;

            if (force) {
                const clientIp = getClientIp(req, config);
                const rateLimitKey = `${clientIp}|${project}`;
                const lastForce = forceRateLimits.get(rateLimitKey) || 0;
                const now = Date.now();

                // Evict expired entries
                for (const [key, timestamp] of forceRateLimits.entries()) {
                    if (now - timestamp >= FORCE_RESET_RATE_LIMIT_MS) {
                        forceRateLimits.delete(key);
                    }
                }
                if (now - lastForce < FORCE_RESET_RATE_LIMIT_MS) {
                    logger.warn({ event: "seed_demo_rate_limit_exceeded", ip: clientIp, project });
                    res.status(429).json({
                        error: "Too Many Requests",
                        message: "Force reset is rate limited",
                        rateLimitMs: FORCE_RESET_RATE_LIMIT_MS,
                    });
                    return;
                }
                if (now - (lastGlobalForceResets.get(projectRoom) ?? 0) < FORCE_RESET_RATE_LIMIT_MS) {
                    logger.warn({ event: "seed_demo_global_rate_limit_exceeded", ip: clientIp, project });
                    res.status(429).json({
                        error: "Too Many Requests",
                        message: "Force reset is rate limited",
                        rateLimitMs: FORCE_RESET_RATE_LIMIT_MS,
                    });
                    return;
                }
                rateLimitKeyForForce = rateLimitKey;
                // A forced reset is about to rebuild the document: the warm
                // verdict is stale from this moment, not only once the document
                // has been opened.
                clearDemoWarmState(projectRoom);
            }

            // Joining an in-flight run takes precedence over the warm verdict:
            // that run may be a reset, and this visitor has to hear about it.
            if (inFlightResets.has(projectRoom)) {
                logger.info({ event: "seed_demo_inflight_wait", projectRoom });
                const result = await inFlightResets.get(projectRoom);
                reportTiming("coalesced");
                // Report the coalesced run's verdict: a visitor that joined an
                // in-flight reset must still learn that the document was rebuilt.
                res.json({ success: true, reset: result?.reset === true, coalesced: true, inFlightResult: result });
                return;
            }

            // Warm path: a previous request already proved the template is
            // complete and current, and the document has not changed since.
            // Answer without touching the document at all.
            if (!force && isDemoWarm(projectRoom, Date.now())) {
                logger.info({ event: "seed_demo_warm_path", projectRoom });
                reportTiming("warm");
                res.json({ success: true, reset: false, warm: true });
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
                    // Fall back to the old numeric field so legacy documents
                    // are treated as stale rather than failing a migration.
                    const templateRevision = (metadata.get("templateRevision")
                        ?? metadata.get("templateVersion")) as string | number | undefined;

                    const orderedTree = doc.getMap("orderedTree") as Y.Map<unknown>;
                    const keys = Array.from(orderedTree.keys());
                    const isEmpty = keys.length === 0 || (keys.length === 1 && keys[0] === "root");

                    // Check if any required template page is missing
                    let missingTemplatePages = false;
                    if (!isEmpty) {
                        const currentStateVector = Buffer.from(Y.encodeStateVector(doc)).toString("hex");

                        const fastPath = demoFastPaths.get(projectRoom);
                        if (!force && fastPath && fastPath.stateVectorHex === currentStateVector) {
                            missingTemplatePages = fastPath.missingTemplatePages;
                        } else {
                            // `templatePageId` is locale-stable (the page's `key`)
                            // while the title it should carry is translated, so the
                            // two are compared through this locale's title map.
                            // That is what still makes renaming a page force a
                            // reseed, in every locale.
                            const localePages = demoPagesFor(locale);
                            const expectedTemplateIds = new Set(localePages.map(p => p.key));
                            const expectedTitleByKey = new Map(
                                localePages.map(p => [p.key, p.title.trim().toLowerCase()]),
                            );
                            const existingTemplateIds = new Set<string>();

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
                                    if (valueMap && valueMap.has("templatePageId")) {
                                        const templatePageId = valueMap.get("templatePageId") as string | undefined;
                                        if (templatePageId) {
                                            const rawText = valueMap.get("text");
                                            let textStr = "";
                                            if (rawText !== undefined && rawText !== null) {
                                                try {
                                                    textStr = typeof (rawText as { toString?: () => string; }).toString
                                                            === "function"
                                                        ? (rawText as { toString: () => string; }).toString()
                                                        : String(rawText);
                                                } catch (e) {
                                                    // ignore
                                                }
                                            }
                                            if (
                                                textStr.trim().toLowerCase() === expectedTitleByKey.get(templatePageId)
                                            ) {
                                                existingTemplateIds.add(templatePageId);
                                            }
                                        }
                                    }
                                }
                            }

                            for (const expected of expectedTemplateIds) {
                                if (!existingTemplateIds.has(expected)) {
                                    missingTemplatePages = true;
                                    break;
                                }
                            }
                            demoFastPaths.set(projectRoom, {
                                stateVectorHex: currentStateVector,
                                missingTemplatePages,
                            });
                        }
                    }

                    const shouldReset = shouldResetDemo({
                        isEmpty,
                        lastReset,
                        templateRevision,
                        now,
                        force,
                        missingTemplatePages,
                    });

                    if (shouldReset) {
                        logger.info({ event: "seed_demo_resetting", lastReset, templateRevision, now, force });

                        await directConnection.transact((document: unknown) => {
                            const ydoc = document as unknown as Y.Doc;
                            const meta = ydoc.getMap("metadata");
                            meta.set("isResetting", true);
                            meta.set("resetStartedAt", now);
                        });

                        demoFastPaths.delete(projectRoom);
                        clearDemoWarmState(projectRoom);

                        try {
                            const docProject = Project.fromDoc(doc as unknown as Y.Doc);

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

                                // Clear the table registry so stale
                                // user-created tables do not accumulate.
                                const tables = ydoc.getMap("yjsTables");
                                Array.from(tables.keys()).forEach(key => {
                                    tables.delete(key);
                                });

                                // Clear the grids registry so visitor-created
                                // grids or modified template grids are reset.
                                const grids = ydoc.getMap("yjsGrids");
                                Array.from(grids.keys()).forEach(key => {
                                    grids.delete(key);
                                });

                                // Same for schedule rules: the template's own
                                // rules are re-registered by populateDemoProject.
                                const schedules = ydoc.getMap("schedules");
                                Array.from(schedules.keys()).forEach(key => {
                                    schedules.delete(key);
                                });

                                // Same for calendars: the template's own
                                // calendars are re-registered by populateDemoProject.
                                const calendars = ydoc.getMap("calendars");
                                Array.from(calendars.keys()).forEach(key => {
                                    calendars.delete(key);
                                });

                                // Re-initialize metadata
                                const meta = ydoc.getMap("metadata");
                                // The title is the slug, which is also the room
                                // id and the first URL segment. Internal links
                                // are rendered from it, so a localized demo
                                // titled "demo" would send every link into the
                                // English demo instead of its own pages.
                                meta.delete("title");
                            });

                            // Rebuild the template directly in the live document.
                            // This is done sequentially outside the transaction because
                            // yjs-orderedtree relies on synchronous observeDeep callbacks
                            // which are suspended during a transaction.
                            populateDemoProject(docProject, "seed-server", locale, project);

                            // Seed each demo table's own room (the table
                            // content lives in a subdoc, not the project doc).
                            for (const template of demoTablesFor(locale)) {
                                const tableRoom = `${projectRoom}/tables/${template.tableId}`;
                                const tableConnection = await hocuspocus.openDirectConnection(tableRoom, {
                                    isSeeding: true,
                                });
                                try {
                                    await tableConnection.transact((document: unknown) => {
                                        seedDemoTableDoc(document as unknown as Y.Doc, template);
                                    });
                                } finally {
                                    await tableConnection.disconnect();
                                }
                            }

                            // Commit the completion metadata ONLY AFTER everything succeeded.
                            await directConnection.transact((document: unknown) => {
                                const ydoc = document as unknown as Y.Doc;
                                const meta = ydoc.getMap("metadata");
                                meta.set("lastReset", now);
                                meta.set("templateRevision", DEMO_TEMPLATE_REVISION);
                                meta.delete("templateVersion");
                            });
                        } finally {
                            await directConnection.transact((document: unknown) => {
                                const ydoc = document as unknown as Y.Doc;
                                const meta = ydoc.getMap("metadata");
                                meta.set("isResetting", false);
                            });
                        }
                    } else {
                        logger.info({ event: "seed_demo_no_reset_needed", lastReset, templateRevision, now });
                    }

                    if (shouldReset) {
                        // The document we just rebuilt is by definition current.
                        rememberDemoWarmState(
                            projectRoom,
                            doc as unknown as Y.Doc,
                            now,
                            DEMO_TEMPLATE_REVISION,
                            Date.now(),
                        );
                    } else if (lastReset !== undefined && templateRevision === DEMO_TEMPLATE_REVISION) {
                        rememberDemoWarmState(projectRoom, doc as unknown as Y.Doc, lastReset, templateRevision, now);

                        // Independently verify each demo table room and re-seed if missing or stale
                        for (const template of demoTablesFor(locale)) {
                            const tableRoom = `${projectRoom}/tables/${template.tableId}`;
                            const tableConnection = await hocuspocus.openDirectConnection(tableRoom, {
                                isSeeding: true,
                            });
                            try {
                                const tableDoc = tableConnection.document;
                                if (tableDoc) {
                                    const meta = tableDoc.getMap("metadata") as Y.Map<unknown>;
                                    const tableTemplateRevision = (meta.get("templateRevision")
                                        ?? meta.get("templateVersion")) as string | number | undefined;
                                    if (tableTemplateRevision !== DEMO_TEMPLATE_REVISION) {
                                        logger.info({ event: "seed_demo_table_resetting", tableRoom });
                                        await tableConnection.transact((document: unknown) => {
                                            seedDemoTableDoc(document as unknown as Y.Doc, template);
                                        });
                                    }
                                }
                            } finally {
                                await tableConnection.disconnect();
                            }
                        }
                    }

                    return { success: true, reset: shouldReset, project };
                } finally {
                    // Must disconnect to prevent memory leak
                    await directConnection.disconnect();
                }
            })();

            inFlightResets.set(projectRoom, resetPromise);
            try {
                const result = await resetPromise;
                if (rateLimitKeyForForce && result.reset) {
                    const finishTime = Date.now();
                    forceRateLimits.set(rateLimitKeyForForce, finishTime);
                    lastGlobalForceResets.set(projectRoom, finishTime);
                }
                reportTiming(result.reset ? "reset" : "validated");
                res.json(result);
            } finally {
                inFlightResets.delete(projectRoom);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: new Error(errorMessage), event: "seed_demo_error" }, "An error occurred");
            // A failed validation or reset must never leave a warm verdict behind.
            clearDemoWarmState();
            reportTiming("error");
            res.status(500).json({ error: "Demo seeding failed", message: errorMessage });
        }
    });

    return router;
}
