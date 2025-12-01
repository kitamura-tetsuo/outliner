// Metadata Y.Doc module for persisting container metadata (titles, etc.) locally
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

// Singleton Y.Doc instance for container metadata
export const metaDoc = new Y.Doc();

// IndexedDB persistence for local-only storage
const persistence = new IndexeddbPersistence("outliner-meta", metaDoc);

// Y.Map structure for storing container metadata
export const containersMap = metaDoc.getMap("containers");

// Type for container metadata
interface ContainerMetadata {
    title: string;
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
 * Set container title in metadata Y.Doc
 * @param containerId - The container ID to update
 * @param title - The title to set
 */
export function setContainerTitleInMetaDoc(containerId: string, title: string): void {
    containersMap.set(containerId, { title } as ContainerMetadata);
}

// Log initialization status
if (typeof window !== "undefined") {
    console.log("[metaDoc] Initialized metadata Y.Doc with IndexedDB persistence");

    // Optional: Log when IndexedDB data is loaded
    persistence.once("synced", () => {
        console.log("[metaDoc] IndexedDB data loaded");
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
            };
        }).__META_DOC_MODULE__ = {
            setContainerTitleInMetaDoc,
            getContainerTitleFromMetaDoc,
        };
    }
}
