import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRoomSyncStates, getRoomSyncState, onRoomSyncStateChange, setRoomSyncState } from "../../../lib/yjs/roomSyncState";

describe("roomSyncState", () => {
    beforeEach(() => {
        clearRoomSyncStates();
    });

    it("returns undefined for a room that was never touched", () => {
        expect(getRoomSyncState("projects/unknown")).toBeUndefined();
    });

    it("stores and retrieves the latest state per room", () => {
        setRoomSyncState("projects/a", "pending");
        setRoomSyncState("projects/b", "synced");

        expect(getRoomSyncState("projects/a")).toBe("pending");
        expect(getRoomSyncState("projects/b")).toBe("synced");
    });

    it("notifies subscribers of a room when its state changes", () => {
        const listener = vi.fn();
        const unsubscribe = onRoomSyncStateChange("projects/a", listener);

        setRoomSyncState("projects/a", "pending");
        setRoomSyncState("projects/a", "synced");

        expect(listener).toHaveBeenNthCalledWith(1, "pending");
        expect(listener).toHaveBeenNthCalledWith(2, "synced");

        unsubscribe();
        setRoomSyncState("projects/a", "timed-out");
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("does not notify subscribers of a different room", () => {
        const listener = vi.fn();
        onRoomSyncStateChange("projects/a", listener);

        setRoomSyncState("projects/b", "denied");

        expect(listener).not.toHaveBeenCalled();
    });
});
