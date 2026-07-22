import { beforeEach, describe, expect, it } from "vitest";
import { addSnapshot, getSnapshot, listSnapshots, replaceWithSnapshot } from "../services";

const project = "testproj";
const page = "testpage";

function clear() {
    if (typeof localStorage !== "undefined") {
        localStorage.clear();
    }
}

describe("snapshotService", () => {
    beforeEach(() => {
        clear();
    });

    it("adds and lists snapshots", () => {
        addSnapshot(project, page, "a", "user");
        addSnapshot(project, page, "b", "user");
        const snaps = listSnapshots(project, page);
        expect(snaps.length).toBe(2);
    });

    it("retrieves snapshot and replaces content", () => {
        const snap1 = addSnapshot(project, page, "a", "user");
        addSnapshot(project, page, "b", "user");
        const found = getSnapshot(project, page, snap1.id);
        expect(found?.content).toBe("a");
        replaceWithSnapshot(project, page, snap1.id);
        const snaps = listSnapshots(project, page);
        expect(snaps.length).toBe(3);
    });
});
