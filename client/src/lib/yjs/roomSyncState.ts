// Tracks whether a Yjs room has completed its initial sync with the server.
// This exists so the UI can tell "connected but still using a possibly stale
// offline copy" apart from "fully synced", instead of the previous behavior
// where a silent 30s timeout made both states indistinguishable.

export type RoomSyncState = "pending" | "synced" | "timed-out" | "denied" | "too-large" | "rate-limited" | "retrying";

const states = new Map<string, RoomSyncState>();
const listeners = new Map<string, Set<(state: RoomSyncState) => void>>();

export function setRoomSyncState(room: string, state: RoomSyncState): void {
    if (states.size >= 100 && !states.has(room)) {
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
            console.warn("RoomSyncState leak warning: over 100 rooms all have active listeners");
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
}

export function getRoomSyncState(room: string): RoomSyncState | undefined {
    return states.get(room);
}

export function onRoomSyncStateChange(room: string, listener: (state: RoomSyncState) => void): () => void {
    let set = listeners.get(room);
    if (!set) {
        set = new Set();
        listeners.set(room, set);
    }
    set.add(listener);
    return () => {
        set?.delete(listener);
    };
}

export function deleteRoomSyncState(room: string): void {
    states.delete(room);
    listeners.delete(room);
}

// Exposed for tests only
export function clearRoomSyncStates(): void {
    states.clear();
    listeners.clear();
}
