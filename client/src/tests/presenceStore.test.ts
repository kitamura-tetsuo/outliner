import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import PresenceAvatars from "../components/PresenceAvatars.svelte";

// Local helper to avoid importing PresenceStore module
function colorForUser(id: string): string {
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${hash}, 70%, 50%)`;
}

describe("presence store", () => {
    it("adds and removes users", () => {
        // Render a component to initialize window.presenceStore
        render(PresenceAvatars);
        const presenceStore = (globalThis as { presenceStore?: unknown; }).presenceStore;
        presenceStore.setUser({ userId: "u1", userName: "Alice", color: colorForUser("u1") });
        expect(presenceStore.users["u1"].userName).toBe("Alice");
        presenceStore.removeUser("u1");
        expect(presenceStore.users["u1"]).toBeUndefined();
    });
});
