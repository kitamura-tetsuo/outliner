import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it } from "vitest";
import PresenceAvatars from "../../../components/PresenceAvatars.svelte";
import { presenceStore } from "../../../stores/PresenceStore.svelte";

// Local copy to avoid importing PresenceStore module from tests
function colorForUser(id: string): string {
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${hash}, 70%, 50%)`;
}

/**
 * Integration test mirroring e2e/new/prs-real-time-presence-indicators-7b6a1ea8.spec.ts
 * Verifies that presence avatars reflect users joining and leaving.
 */

describe("PRS-0001 presence indicators", () => {
    it("renders and updates user avatars", async () => {
        // reset store before rendering to avoid picking up stale state
        presenceStore.users = {};
        await tick();

        // Render component
        const { container } = render(PresenceAvatars);

        // add initial user
        presenceStore.setUser({ userId: "u1", userName: "User 1", color: colorForUser("u1") });
        await tick();
        const row = container.querySelector('[data-testid="presence-row"]')!;
        let avatars = row.querySelectorAll(".presence-avatar");
        expect(avatars.length).toBe(1);

        // add second user
        presenceStore.setUser({ userId: "u2", userName: "User 2", color: "hsl(240, 70%, 50%)" });
        await tick();
        avatars = row.querySelectorAll(".presence-avatar");
        expect(avatars.length).toBe(2);
        const colors = Array.from(avatars).map(a => (a as HTMLElement).style.backgroundColor);
        expect(colors[0]).not.toBe(colors[1]);

        // remove user
        presenceStore.removeUser("u2");
        await tick();
        avatars = row.querySelectorAll(".presence-avatar");
        expect(avatars.length).toBe(1);
    });
});
