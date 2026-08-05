import type { Project as AppProject } from "../schema/app-schema";
import type { Item } from "../schema/app-schema";
import { getYjsClientByProjectTitle } from "../services";
import { store } from "../stores/store.svelte";
import { yjsStore } from "../stores/yjsStore.svelte";
import { findPageByName as sharedFindPageByName } from "../utils/pageUtils";
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

    // 2. Update store (optional here, but maintaining current behavior)
    yjsStore.yjsClient = client as unknown as import("../yjs/YjsClient").YjsClient;
    const project = client.getProject?.();

    if (!project) {
        throw new Error("Project data not found in client");
    }

    // We don't want to strictly require store population here as we might just want to load the client independently
    // but the current architecture heavily relies on these stores. Let's make it optional or a side effect.
    store.project = project as unknown as AppProject;
    logger.info(`loadProjectAndPage: Project loaded: "${project.title}"`);

    // 3. Search and identify page
    const findPage = () => {
        if (!project?.items) return null;
        const found = sharedFindPageByName(project.items as unknown as Iterable<Item>, pageName);
        return found as Item | null;
    };

    let targetPage = findPage();

    if (!targetPage) {
        logger.info(`loadProjectAndPage: Page "${pageName}" not found initially. Retrying...`);
        const maxRetries = import.meta.env.MODE === "test" ? 150 : 5;
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
