import { getLogger } from "./logger";
const logger = getLogger("metaDoc");

// Metadata Y.Doc module for persisting container metadata (titles, etc.) locally
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

// Singleton Y.Doc instance for container metadata
export const metaDoc = new Y.Doc();

// IndexedDB persistence for local-only storage
// Use a separate database name from container Y.Docs to avoid conflicts
// Only initialize IndexedDB in browser environments
let persistence: IndexeddbPersistence | null = null;
if (typeof window !== "undefined") {
    persistence = new IndexeddbPersistence("outliner-meta", metaDoc);
}

// Reactive state for tracking metadata updates
export const metaDocState = $state({ version: 0 });

// Promise to track when metadata is loaded from IndexedDB
// Promise to track when metadata is loaded from IndexedDB
export const metaDocLoaded = new Promise<void>((resolve) => {
    if (persistence) {
        persistence.once("synced", () => {
            metaDocState.version++;
            resolve();
        });
    } else {
        // Resolve immediately in non-browser environments
        resolve();
    }
});

// Y.Map structure for storing container metadata
export const containersMap = metaDoc.getMap("containers");
export const pendingRegistrationsMap = metaDoc.getMap("pendingRegistrations");

// Track changes to container metadata
containersMap.observe(() => {
    metaDocState.version++;
});

pendingRegistrationsMap.observe(() => {
    metaDocState.version++;
});

// Type for container metadata
interface ContainerMetadata {
    title: string;
    lastOpenedAt?: number;
}

/**
 * Get container title from metadata Y.Doc
 * @param containerId - The container ID to look up
 * @returns The container title or empty string if not found
 */
export function getContainerTitleFromMetaDoc(containerId: string): string {
    const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
    return containerData?.title || "";
}

/**
 * Alias for getContainerTitleFromMetaDoc (used after migration from containers to projects)
 * @param projectId - The project ID to look up
 * @returns The project title or empty string if not found
 */
export const getProjectTitleFromMetaDoc = getContainerTitleFromMetaDoc;

/**
 * Set container title in metadata Y.Doc
 * @param containerId - The container ID to update
 * @param title - The title to set
 */
export function setContainerTitleInMetaDoc(containerId: string, title: string): void {
    containersMap.set(containerId, { title } as ContainerMetadata);
}

/**
 * Update the last opened timestamp for a container
 * @param containerId - The container ID to update
 */
export function updateLastOpenedAt(containerId: string): void {
    const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
    const currentTitle = containerData?.title || "";
    containersMap.set(containerId, {
        title: currentTitle,
        lastOpenedAt: Date.now(),
    } as ContainerMetadata);
}

/**
 * Get last opened timestamp for a container
 * @param containerId - The container ID to look up
 * @returns The timestamp or undefined if not found
 */
export function getLastOpenedAt(containerId: string): number | undefined {
    const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
    return containerData?.lastOpenedAt;
}

/**
 * Get project ID by title from metadata Y.Doc
 * @param title The project title to look up
 * @returns The project ID or undefined if not found
 */
export function getProjectIdByTitle(title: string): string | undefined {
    for (const [containerId, containerData] of containersMap.entries()) {
        if ((containerData as ContainerMetadata).title === title) {
            return containerId;
        }
    }
    return undefined;
}

/**
 * Queue a project registration to be sent to the server later
 * @param projectId - The project ID to queue
 * @param title - The project title
 */
export function queueProjectRegistration(projectId: string, title: string): void {
    pendingRegistrationsMap.set(projectId, title);
}

/**
 * Remove a pending project registration from the queue
 * @param projectId - The project ID to remove
 */
export function removePendingRegistration(projectId: string): void {
    if (pendingRegistrationsMap.has(projectId)) {
        pendingRegistrationsMap.delete(projectId);
    }
}

/**
 * Get all pending project registrations
 * @returns Array of pending registrations
 */
export function getPendingRegistrations(): { projectId: string; title: string }[] {
    const pending: { projectId: string; title: string }[] = [];
    pendingRegistrationsMap.forEach((title, projectId) => {
        pending.push({ projectId, title: title as string });
    });
    return pending;
}

// Log initialization status
if (typeof window !== "undefined") {
    logger.debug("[metaDoc] Initialized metadata Y.Doc with IndexedDB persistence");

    // Optional: Log when IndexedDB data is loaded
    persistence?.once("synced", () => {
        logger.debug("[metaDoc] IndexedDB data loaded");
    });
}

// Expose metaDoc functions to window for E2E testing
if (typeof window !== "undefined") {
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || window.location.hostname === "localhost";

    if (isTestEnv) {
        (window as Window & typeof globalThis & {
            __META_DOC_MODULE__?: {
                setContainerTitleInMetaDoc: typeof setContainerTitleInMetaDoc;
                getContainerTitleFromMetaDoc: typeof getContainerTitleFromMetaDoc;
                updateLastOpenedAt: typeof updateLastOpenedAt;
                getLastOpenedAt: typeof getLastOpenedAt;
            };
        }).__META_DOC_MODULE__ = {
            setContainerTitleInMetaDoc,
            getContainerTitleFromMetaDoc,
            updateLastOpenedAt,
            getLastOpenedAt,
        };
    }
}
