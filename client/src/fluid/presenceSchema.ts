import type { Latest, Presence, StatesWorkspaceSchema } from "@fluidframework/presence/beta";
import { StateFactory } from "@fluidframework/presence/beta";

// Minimal presence payload used for cursors
export interface PresenceCursor {
    itemId: string;
    offset: number;
    isActive?: boolean;
}

function isPresenceCursor(value: unknown): value is PresenceCursor {
    if (typeof value !== "object" || value === null) return false;
    const c = value as PresenceCursor;
    return typeof c.itemId === "string" && typeof c.offset === "number";
}

export const PresenceSchema = {
    position: StateFactory.latest<PresenceCursor>({
        validator: (v) => isPresenceCursor(v) ? v : undefined,
    }),
} as const satisfies StatesWorkspaceSchema;

export function getWorkspace(presence: Presence): {
    position: Latest<PresenceCursor>;
} {
    return presence.states.getWorkspace("cursors", PresenceSchema).states;
}
