import { describe, expect, it } from "vitest";
import { pageRoomPath, projectRoomPath } from "./roomPath";

describe("roomPath", () => {
    it("should return project room path", () => {
        const path = projectRoomPath("proj123");
        expect(path).toBe("projects/proj123");
    });

    it("should return page room path", () => {
        const path = pageRoomPath("proj123", "page456");
        expect(path).toBe("projects/proj123/pages/page456");
    });
});
