// Augmented type definitions for y-protocols/awareness to strengthen typing in our app
// Narrow the local state fields we actually use across the app

declare module "y-protocols/awareness" {
    export interface PresenceCursor {
        itemId: string;
        offset: number;
    }
    /**
     * A selection as it travels over awareness (#5025).
     *
     * `start`/`end` are the endpoints this build publishes and reads; the flat text fields
     * remain for peers that predate the endpoint model, and are absent for an endpoint that
     * sits at a visual node rather than at a character. Every field is optional because the
     * payload comes from another client: the receiver validates it before use.
     */
    export interface PresenceSelection {
        start?: unknown;
        end?: unknown;
        startItemId?: string;
        startOffset?: number;
        endItemId?: string;
        endOffset?: number;
    }
    export interface LocalPresenceState {
        user?: { userId: string; name: string; color?: string; } | null;
        presence?: { cursor?: PresenceCursor; selection?: PresenceSelection; } | null;
        cursor?: PresenceCursor | null; // used by older helpers
        selection?: PresenceSelection | null; // used by older helpers
        lastSeen?: number;
    }

    export class Awareness {
        constructor(doc: import("yjs").Doc);
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
