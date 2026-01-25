import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { getYjsProvider } from "../../yjs/YjsClient";
import { getLogger } from "../logger";

const logger = getLogger("yjs-service");

/**
 * Create Yjs client
 */
export async function createYjsClient(projectId: string): Promise<any> {
    logger.info(`Creating Yjs client for project: ${projectId}`);

    // Get authenticated user
    const user = userManager.getCurrentUser();
    if (!user) {
        logger.warn("User not authenticated, connecting anonymously");
    }

    // Get Hocuspocus provider
    const provider = getYjsProvider(projectId);

    // Wait for sync (optional)
    // await new Promise<void>(resolve => {
    //     if (provider.synced) resolve();
    //     provider.once("synced", () => resolve());
    // });

    return {
        doc: provider.document,
        provider,
        // Helper method (compatibility)
        getMap: (name: string) => provider.document.getMap(name),
        getArray: (name: string) => provider.document.getArray(name),
        getText: (name: string) => provider.document.getText(name),
        transact: (fn: (transaction: Y.Transaction) => void) => provider.document.transact(fn),
    };
}

/**
 * Get Yjs client by project title (if ID is unknown)
 * In actual implementation, resolve ID from title and call createYjsClient
 */
export async function getYjsClientByProjectTitle(projectTitle: string): Promise<any> {
    // Currently treating title as ID (or needs resolution logic)
    return createYjsClient(projectTitle);
}
