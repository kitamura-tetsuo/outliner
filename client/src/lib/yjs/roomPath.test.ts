import { describe, expect, it } from "vitest";
import { projectRoomPath } from "./roomPath";

describe("roomPath", () => {
    it("should return project room path", () => {
        const path = projectRoomPath("proj123");
        expect(path).toBe("projects/proj123");
    });
});
