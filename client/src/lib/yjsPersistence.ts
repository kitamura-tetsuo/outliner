import { getLogger } from "./logger";
const logger = getLogger("yjsPersistence");

import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";

export class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TimeoutError";
    }
}

export type PersistenceLike = {
    synced: boolean;
    once: (eventName: "synced", callback: () => void) => void;
    off?: (eventName: "synced", callback: () => void) => void;

    _db?: Promise<IDBDatabase>;
    destroy?: () => void | Promise<void>;
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
        logger.debug(`[yjsPersistence] Local cache loaded for container: ${containerId}`);
    });

    return persistence;
}

/**
 * Wait for persistence to complete initial sync from IndexedDB
 * @param persistence - The persistence instance
 * @param timeoutMs - Maximum wait time in milliseconds
 * @returns Promise that resolves when synced or rejects on timeout/error
 */
export function waitForSync(persistence: PersistenceLike, timeoutMs: number = 3000): Promise<void> {
    if (persistence.synced) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const onSynced = () => {
            clearTimeout(timeoutId);
            resolve();
        };

        // Note: lib0's once() wraps the handler, making off() unreliable with the same reference.
        // We rely on persistence.destroy() on error to clean up the listeners.
        persistence.once("synced", onSynced);

        const timeoutId = setTimeout(() => {
            reject(new TimeoutError("waitForSync timed out"));
        }, timeoutMs);

        if (persistence._db) {
            persistence._db.catch((err) => {
                clearTimeout(timeoutId);
                reject(err);
            });
        }
    });
}
