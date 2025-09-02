import { describe, expect, it } from "vitest";
import { pageRoomPath, projectRoomPath } from "../../../lib/yjs/roomPath";

describe("roomPath helpers", () => {
    it("encodes project room path", () => {
        expect(projectRoomPath("proj id")).toBe("projects/proj%20id");
    });

    it("encodes page room path", () => {
        expect(pageRoomPath("proj id", "page/id")).toBe("projects/proj%20id/pages/page%2Fid");
    });
});
