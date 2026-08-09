import { describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { yjsService } from "../../../lib/yjs/service";

vi.mock("../../../lib/yjsPersistence", () => ({
    createPersistence: vi.fn(),
    waitForSync: vi.fn().mockResolvedValue(undefined),
    attachIndexedDbPersistence: vi.fn().mockResolvedValue({ destroy: vi.fn() }),
}));

import { presenceStore } from "../../../stores/PresenceStore.svelte";

describe("Presence Binding Leak", () => {
    it("should only bind once", async () => {
        const doc = new Y.Doc();
        const awareness = new Awareness(doc);

        const unbind1 = yjsService.bindProjectPresence(awareness);
        const unbind2 = yjsService.bindProjectPresence(awareness);

        expect(unbind1).toBe(unbind2);

        const observers = (awareness as unknown as { _observers: Map<string, unknown>; })._observers;

        // One listener from the initial bind
        expect((observers.get("change") as unknown as Set<() => void>)?.size ?? 0).toBe(1);

        unbind1();

        // Listener should be removed
        expect((observers.get("change") as unknown as Set<() => void>)?.size ?? 0).toBe(0);
    });

    it("should not remove user presence if another client ID with the same userId is still connected", async () => {
        const doc = new Y.Doc();
        const awareness = new Awareness(doc);
        const unbind = yjsService.bindProjectPresence(awareness);

        // Spy on presenceStore.removeUser
        const removeUserSpy = vi.spyOn(presenceStore, "removeUser");

        // Two different client IDs (e.g. 1 and 2) but same user ID ("user-123")
        const client1Id = 1;
        const client2Id = 2;
        const userState = { userId: "user-123", name: "Alice", color: "red" };

        // We simulate awareness states changing directly, bypassing some Yjs internals for the test.
        const getStatesSpy = vi.spyOn(awareness, "getStates").mockReturnValue(
            new Map([
                [client1Id, { user: userState }],
                [client2Id, { user: userState }],
            ]),
        );

        // Get the update function that was registered
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const observers = (awareness as unknown as { _observers: Map<string, Set<any>>; })._observers;
        const changeObservers = Array.from(observers.get("change") || []);
        const updateFn = changeObservers[0];

        // Initial setup - both joined
        updateFn({ added: [client1Id, client2Id], updated: [], removed: [] }, "local");

        // Now client1 disconnects
        getStatesSpy.mockReturnValue(
            new Map([
                [client2Id, { user: userState }],
            ]),
        );
        updateFn({ added: [], updated: [], removed: [client1Id] }, "local");

        // verify user was NOT removed from store
        expect(removeUserSpy).not.toHaveBeenCalledWith("user-123");

        // Now client2 disconnects
        getStatesSpy.mockReturnValue(new Map());
        updateFn({ added: [], updated: [], removed: [client2Id] }, "local");

        // verify user WAS removed from store
        expect(removeUserSpy).toHaveBeenCalledWith("user-123");

        unbind();
    });
});
