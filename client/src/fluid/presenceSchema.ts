import type { Latest, Presence, StatesWorkspaceSchema } from "@fluidframework/presence/beta";
import { StateFactory } from "@fluidframework/presence/beta";
import type { CursorPosition } from "../stores/EditorOverlayStore.svelte";

function isCursorPosition(value: unknown): value is CursorPosition {
    if (typeof value !== "object" || value === null) return false;
    const c = value as CursorPosition;
    return typeof c.itemId === "string" && typeof c.offset === "number";
}

export const PresenceSchema = {
    position: StateFactory.latest<CursorPosition>({
        validator: (v) => isCursorPosition(v) ? v : undefined
    }),
} as const satisfies StatesWorkspaceSchema;

export function getWorkspace(presence: Presence):
    {
        position: Latest<CursorPosition>;
    } {
    return presence.states.getWorkspace("cursors", PresenceSchema).states;
}
