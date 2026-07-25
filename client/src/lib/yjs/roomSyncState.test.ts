import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRoomSyncStates, getRoomSyncState, onRoomSyncStateChange, setRoomSyncState } from "./roomSyncState";

describe("roomSyncState", () => {
    beforeEach(() => {
        clearRoomSyncStates();
        vi.restoreAllMocks();
    });

    it("should not evict rooms with active listeners", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Register 100 rooms
        for (let i = 0; i < 100; i++) {
            setRoomSyncState(`room-${i}`, "pending");
        }

        // Subscribe to the first room
        let fired = false;
        onRoomSyncStateChange("room-0", () => {
            fired = true;
        });

        // Register 101st room
        setRoomSyncState("room-100", "pending");

        // Verify room-0 was not evicted
        expect(getRoomSyncState("room-0")).toBe("pending");

        // Verify room-1 was evicted since it has no listeners and is oldest
        expect(getRoomSyncState("room-1")).toBeUndefined();

        // Change state on room-0 and verify listener fires
        setRoomSyncState("room-0", "synced");
        expect(fired).toBe(true);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should warn if all rooms have listeners and keep the entries", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Register 100 rooms and subscribe to all
        for (let i = 0; i < 100; i++) {
            setRoomSyncState(`room-${i}`, "pending");
            onRoomSyncStateChange(`room-${i}`, () => {});
        }

        // Register 101st room
        setRoomSyncState("room-100", "pending");

        // Check warn was called
        expect(warnSpy).toHaveBeenCalledWith("RoomSyncState leak warning: over 100 rooms all have active listeners");

        // Verify room-0 was not evicted
        expect(getRoomSyncState("room-0")).toBe("pending");
        expect(getRoomSyncState("room-100")).toBe("pending");
    });
});
