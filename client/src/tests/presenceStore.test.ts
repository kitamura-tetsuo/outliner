import {
    describe,
    expect,
    it,
} from "vitest";
import {
    colorForUser,
    presenceStore,
} from "../stores/PresenceStore.svelte";

describe("presence store", () => {
    it("adds and removes users", () => {
        presenceStore.setUser({ userId: "u1", userName: "Alice", color: colorForUser("u1") });
        expect(presenceStore.users["u1"].userName).toBe("Alice");
        presenceStore.removeUser("u1");
        expect(presenceStore.users["u1"]).toBeUndefined();
    });
});
