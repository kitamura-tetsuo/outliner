import { describe, expect, it } from "vitest";
import { projectRoomPath } from "../../../lib/yjs/roomPath";

describe("roomPath helpers", () => {
    it("encodes project room path", () => {
        expect(projectRoomPath("proj id")).toBe("projects/proj%20id");
    });

    it("throws when project id is empty", () => {
        expect(() => projectRoomPath("")).toThrow("projectId");
    });
});
