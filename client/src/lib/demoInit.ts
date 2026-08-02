import { Project as AppProject } from "../schema/app-schema";
import { getYjsClientByProjectTitle, removeYjsClientByProjectId } from "../services";
import { store } from "../stores/store.svelte";
import { yjsStore } from "../stores/yjsStore.svelte";
import { DEMO_PROJECT_NAME, seedDemo } from "./demoSeed";
import { getLogger } from "./logger";

const logger = getLogger("demoInit");

let activeCount = 0;
let initPromise: Promise<{ client: any; project: AppProject; }> | null = null;
let releaseTimeout: ReturnType<typeof setTimeout> | null = null;

export async function acquireDemoClient(): Promise<{ client: any; project: AppProject; }> {
    activeCount++;
    if (releaseTimeout) {
        clearTimeout(releaseTimeout);
        releaseTimeout = null;
    }

    if (!initPromise) {
        initPromise = (async () => {
            // Start Yjs connection and API validation in parallel
            const seedPromise = seedDemo();
            const clientPromise = getYjsClientByProjectTitle(DEMO_PROJECT_NAME);

            // Await network errors from seed validation OR successful connection
            let client;
            try {
                client = await Promise.race([
                    clientPromise,
                    seedPromise.catch(() => ({ ok: false, reason: "network" as const })).then(res => {
                        if (!res.ok && res.reason === "network") {
                            throw new Error("Can't reach the demo server — retrying...");
                        }
                        // Block until client connects if seed passes
                        return new Promise<any>(() => {});
                    }),
                ]);
            } catch (e) {
                initPromise = null;
                throw e;
            }

            if (!client) {
                initPromise = null;
                throw new Error("Failed to connect to the demo project.");
            }

            const project = AppProject.fromDoc(client.getProject().ydoc);

            // Continue background validation
            seedPromise.then(async (seedResult) => {
                if (seedResult.ok && seedResult.reset) {
                    if (activeCount <= 0) return; // Prevent hijacking if user left demo
                    logger.info("Demo was reset by server, reconnecting...");
                    removeYjsClientByProjectId(DEMO_PROJECT_NAME);
                    const newClient = await getYjsClientByProjectTitle(DEMO_PROJECT_NAME);
                    if (newClient) {
                        yjsStore.yjsClient = newClient;
                        store.project = AppProject.fromDoc(newClient.getProject().ydoc);
                    }
                }
            }).catch(err => {
                logger.warn("Background seed validation failed", err);
            });

            // Don't cache a stale client if it got reset in the background
            seedPromise.then(seedResult => {
                if (seedResult.ok && seedResult.reset) {
                    initPromise = null;
                }
            }).catch(() => {
                initPromise = null;
            });
            return { client, project };
        })();
    }

    return initPromise;
}

export function releaseDemoClient() {
    activeCount--;
    if (activeCount <= 0) {
        activeCount = 0;
        releaseTimeout = setTimeout(() => {
            if (activeCount === 0) {
                initPromise = null;
                try {
                    removeYjsClientByProjectId(DEMO_PROJECT_NAME);
                    if (store.project?.title === DEMO_PROJECT_NAME || store.project?.id === DEMO_PROJECT_NAME) {
                        yjsStore.yjsClient = undefined;
                        store.project = undefined;
                        store.currentPage = undefined;
                    }
                } catch (_e) {
                    logger.error(_e);
                }
            }
        }, 500); // 500ms grace period for Svelte navigation
    }
}
