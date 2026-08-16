import type { Project as AppProject } from "../schema/app-schema";
import type { Item } from "../schema/app-schema";
import { getYjsClientByProjectTitle } from "../services";
import { store } from "../stores/store.svelte";
import { yjsStore } from "../stores/yjsStore.svelte";
import { findPageByName as sharedFindPageByName, allocatePageTitle } from "../utils/pageUtils";
import { iterateItems } from "../utils/itemTraversal";
import type { YjsClient } from "../yjs/YjsClient";
import { getLogger } from "./logger";

const logger = getLogger("projectPageLoader");

export async function loadProjectAndPage(projectName: string, pageName: string): Promise<{
    client: YjsClient;
    project: AppProject;
    page: Item;
}> {
    logger.info(`loadProjectAndPage: Starting for project="${projectName}", page="${pageName}"`);

    // 1. Get client
    logger.info(`loadProjectAndPage: Getting Yjs client for "${projectName}"`);
    const client = await getYjsClientByProjectTitle(projectName);

    if (!client) {
        logger.warn(`loadProjectAndPage: Project client not found for "${projectName}"`);
        throw new Error(`Project "${projectName}" could not be loaded.`);
    }

    // 2. Wait for initial sync event from provider
    // This avoids race conditions and 500ms hardcoded polling limits
    if (client.wsProvider && !client.wsProvider.isSynced) {
        logger.info(`loadProjectAndPage: Waiting for provider sync...`);
        try {
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Provider sync timeout"));
                }, 10000); // 10 second timeout

                const onSync = () => {
                    clearTimeout(timeout);
                    client.wsProvider?.off("synced", onSync);
                    resolve();
                };
                client.wsProvider?.on("synced", onSync);
            });
        } catch (e) {
            logger.warn({ error: e }, `loadProjectAndPage: Error waiting for sync, proceeding anyway`);
        }
    }

    // 3. Update store
    yjsStore.yjsClient = client as unknown as import("../yjs/YjsClient").YjsClient;
    const project = client.getProject?.();

    if (!project) {
        throw new Error("Project data not found in client");
    }

    store.project = project as unknown as AppProject;
    logger.info(`loadProjectAndPage: Project loaded: "${project.title}"`);

    // Repair any titleless pages deterministically before searching
    if (project?.items) {
        project.ydoc.transact(() => {
            const blankPages = [];
            for (const p of iterateItems(project.items as unknown as Iterable<Item>)) {
                if (!p) continue;
                const textStr = typeof p.text?.toString === "function" ? p.text.toString() : String(p.text ?? "");
                if (!textStr.trim()) {
                    blankPages.push(p);
                }
            }

            // Sort by key as stable fallback
            blankPages.sort((a, b) => (a.key || a.id || "").localeCompare(b.key || b.id || ""));

            for (const blankPage of blankPages) {
                const textStr = typeof blankPage.text?.toString === "function" ? blankPage.text.toString() : String(blankPage.text ?? "");
                if (!textStr.trim()) {
                    const newTitle = allocatePageTitle(project.items as unknown as Iterable<Item>, "", blankPage.id || blankPage.key);
                    if ('updateText' in blankPage && typeof blankPage.updateText === 'function') {
                        blankPage.updateText(newTitle);
                    }
                }
            }
        });
    }

    // 4. Search and identify page
    const findPage = () => {
        if (!project?.items) return null;
        const found = sharedFindPageByName(project.items as unknown as Iterable<Item>, pageName);
        return found as Item | null;
    };

    let targetPage = findPage();

    if (!targetPage) {
        // Fallback retry for eventual consistency (e.g., tests that seed via API and have minor network lag)
        logger.info(`loadProjectAndPage: Page "${pageName}" not found initially. Retrying...`);
        const maxRetries = import.meta.env.MODE === "test" ? 150 : 20; // 2 seconds in production, 15 seconds in test
        for (let i = 0; i < maxRetries; i++) {
            await new Promise((r) => setTimeout(r, 100));
            targetPage = findPage();
            if (targetPage) {
                logger.info(`loadProjectAndPage: Found page "${pageName}" after retry ${i + 1}`);
                break;
            }
        }
    }

    if (!targetPage) {
        logger.info(`loadProjectAndPage: Page "${pageName}" not found.`);
        throw new Error(`Page "${pageName}" not found in project "${projectName}".`);
    }

    store.currentPage = targetPage;
    return { client: client as YjsClient, project: project as AppProject, page: targetPage };
}
