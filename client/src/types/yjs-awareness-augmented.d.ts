// Augmented type definitions for y-protocols/awareness to strengthen typing in our app
// Narrow the local state fields we actually use across the app

import * as Y from "yjs";

declare module "y-protocols/awareness" {
    export interface PresenceCursor {
        itemId: string;
        offset: number;
    }
    export interface PresenceSelection {
        startItemId: string;
        startOffset: number;
        endItemId: string;
        endOffset: number;
    }
    export interface LocalPresenceState {
        user?: { userId: string; name: string; color?: string; } | null;
        presence?: { cursor?: PresenceCursor; selection?: PresenceSelection; } | null;
        cursor?: PresenceCursor | null; // used by older helpers
        selection?: PresenceSelection | null; // used by older helpers
        lastSeen?: number;
    }

    export class Awareness {
        constructor(doc: Y.Doc);
        getLocalState(): LocalPresenceState | undefined;
        setLocalStateField<K extends keyof LocalPresenceState>(field: K, value: LocalPresenceState[K]): void;
        on(
            event: "change",
            cb: (payload: { added: number[]; updated: number[]; removed: number[]; }, origin: unknown) => void,
        ): void;
        off(
            event: "change",
            cb: (payload: { added: number[]; updated: number[]; removed: number[]; }, origin: unknown) => void,
        ): void;
        getStates(): Map<number, LocalPresenceState>;
    }
}
