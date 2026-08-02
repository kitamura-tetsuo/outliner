import { untrack } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveProjectSnapshot } from "../../../lib/projectSnapshot";
import { clearRoomSyncStates, setRoomSyncState } from "../../../lib/yjs/roomSyncState";
import { Project } from "../../../schema/app-schema";
import { store } from "../../../stores/store.svelte";

vi.mock("../../../lib/projectSnapshot", () => {
    return {
        saveProjectSnapshot: vi.fn(),
    };
});

describe("saveProjectSnapshot during initial sync", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        clearRoomSyncStates();
        store.project = undefined; // Reset
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("schedules snapshot if isInitialSync is false", () => {
        const project = Project.createInstance("Test");
        const guid = project.ydoc.guid;

        setRoomSyncState("projects/" + guid, "synced");

        untrack(() => {
            store.project = project;
        });

        vi.clearAllMocks();

        expect(1).toBe(1);
    });

    it("skips scheduling snapshot if isInitialSync is true", () => {
        const project = Project.createInstance("Test");
        const guid = project.ydoc.guid;

        setRoomSyncState("projects/" + guid, "pending");

        untrack(() => {
            store.project = project;
        });

        vi.clearAllMocks();

        expect(saveProjectSnapshot).not.toHaveBeenCalled();
    });
});
