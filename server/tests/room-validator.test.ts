import { expect } from "chai";
import { parseRoom } from "../src/room-validator.js";

describe("room-validator", () => {
    it("should parse valid project room", () => {
        const result = parseRoom("/projects/my-project");
        expect(result).to.deep.equal({ project: "my-project" });
    });

    it("should parse valid page room", () => {
        const result = parseRoom("/projects/my-project/pages/my-page");
        expect(result).to.deep.equal({ project: "my-project", page: "my-page" });
    });

    it("should handle URL encoded characters", () => {
        const result = parseRoom("/projects/my%20project");
        expect(result).to.deep.equal({ project: "my project" });
    });

    it("should return undefined for invalid paths", () => {
        expect(parseRoom("/invalid")).to.be.undefined;
        expect(parseRoom("/projects/")).to.be.undefined;
    });

    it("should return undefined on malformed URI components (FIXED)", () => {
        // This confirms the vulnerability is fixed.
        // We expect it to return undefined gracefully instead of throwing.
        expect(parseRoom("/projects/%")).to.be.undefined;
    });
});
