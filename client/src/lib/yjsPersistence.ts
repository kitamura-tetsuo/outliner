import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";

export type PersistenceLike = {
    synced: boolean;
    once: (eventName: "synced", callback: () => void) => void;
};

/**
 * Create an IndexedDB persistence provider for the given Y.Doc
 * @param containerId - Unique container identifier
 * @param doc - The Y.Doc instance to persist
 * @returns The persistence instance
 */
export function createPersistence(
    containerId: string,
    doc: Y.Doc,
): IndexeddbPersistence {
    const dbName = `container-${containerId}`;
    const persistence = new IndexeddbPersistence(dbName, doc);

    // Log when initial sync from IndexedDB is complete
    persistence.once("synced", () => {
        console.log(`[yjsPersistence] Local cache loaded for container: ${containerId}`);
    });

    return persistence;
}

/**
 * Wait for persistence to complete initial sync from IndexedDB
 * @param persistence - The persistence instance
 * @returns Promise that resolves when synced
 */
export function waitForSync(persistence: PersistenceLike): Promise<void> {
    return new Promise((resolve) => {
        if (persistence.synced) {
            resolve();
        } else {
            persistence.once("synced", () => resolve());
        }
    });
}
