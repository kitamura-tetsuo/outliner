// Tracks whether a Yjs room has completed its initial sync with the server.
// This exists so the UI can tell "connected but still using a possibly stale
// offline copy" apart from "fully synced", instead of the previous behavior
// where a silent 30s timeout made both states indistinguishable.

export type RoomSyncState = "pending" | "synced" | "timed-out" | "denied";

const states = new Map<string, RoomSyncState>();
const listeners = new Map<string, Set<(state: RoomSyncState) => void>>();

export function setRoomSyncState(room: string, state: RoomSyncState): void {
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

// Exposed for tests only
export function clearRoomSyncStates(): void {
    states.clear();
    listeners.clear();
}
