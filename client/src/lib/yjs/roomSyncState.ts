// Tracks whether a Yjs room has completed its initial sync with the server.
// This exists so the UI can tell "connected but still using a possibly stale
// offline copy" apart from "fully synced", instead of the previous behavior
// where a silent 30s timeout made both states indistinguishable.

import { getLogger } from "../logger";

const logger = getLogger("RoomSyncState");

function createRoomRegistry<T>(label: string, max = 100) {
    const states = new Map<string, T>();
    const listeners = new Map<string, Set<(state: T) => void>>();

    return {
        set(room: string, state: T): void {
            if (states.size >= max && !states.has(room)) {
                let candidateForEviction: string | undefined;
                for (const candidate of states.keys()) {
                    const roomListeners = listeners.get(candidate);
                    if (!roomListeners || roomListeners.size === 0) {
                        candidateForEviction = candidate;
                        break;
                    }
                }

                if (candidateForEviction) {
                    states.delete(candidateForEviction);
                    listeners.delete(candidateForEviction);
                } else {
                    logger.warn(`${label} leak warning: over ${max} rooms all have active listeners`);
                }
            }

            states.set(room, state);
            const set = listeners.get(room);
            if (!set) return;
            for (const listener of set) {
                try {
                    listener(state);
                } catch {
                    // Listener errors must not break sync-state propagation
                }
            }
        },

        get(room: string): T | undefined {
            return states.get(room);
        },

        subscribe(room: string, listener: (state: T) => void): () => void {
            let set = listeners.get(room);
            if (!set) {
                set = new Set();
                listeners.set(room, set);
            }
            set.add(listener);
            return () => {
                set?.delete(listener);
                if (set?.size === 0) {
                    listeners.delete(room);
                }
            };
        },

        delete(room: string): void {
            states.delete(room);
            listeners.delete(room);
        },

        clear(): void {
            states.clear();
            listeners.clear();
        },
    };
}

export type RoomSyncState = "pending" | "synced" | "timed-out" | "denied" | "too-large" | "rate-limited" | "retrying";

const syncStates = createRoomRegistry<RoomSyncState>("RoomSyncState");

export const setRoomSyncState = syncStates.set;
export const getRoomSyncState = syncStates.get;
export const onRoomSyncStateChange = syncStates.subscribe;
export const deleteRoomSyncState = syncStates.delete;
// Exposed for tests only
export const clearRoomSyncStates = syncStates.clear;

export type RoomPersistenceError = boolean; // true = fatal error, false = timeout (but continuing in background)

const persistenceErrors = createRoomRegistry<RoomPersistenceError>("RoomPersistenceError");

export const setRoomPersistenceError = persistenceErrors.set;
export const getRoomPersistenceError = persistenceErrors.get;
export const onRoomPersistenceErrorChange = persistenceErrors.subscribe;
export const deleteRoomPersistenceError = persistenceErrors.delete;
export const clearRoomPersistenceErrorStates = persistenceErrors.clear;
