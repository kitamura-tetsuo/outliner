import { expect } from "chai";
import { parseRoom } from "../src/room-validator.js";

describe("room-validator", () => {
    it("should parse valid project room", () => {
        const result = parseRoom("/projects/my-project");
        expect(result).to.deep.equal({ project: "my-project" });
    });

    it("should handle URL encoded characters", () => {
        const result = parseRoom("/projects/my%20project");
        expect(result).to.deep.equal({ project: "my project" });
    });

    it("should return undefined for invalid paths", () => {
        expect(parseRoom("/invalid")).to.be.undefined;
        expect(parseRoom("/projects/")).to.be.undefined;
    });

    it("should parse table subdoc rooms and inherit the project", () => {
        const result = parseRoom("/projects/my-project/tables/0a1b2c3d-4e5f-6789-abcd-ef0123456789");
        expect(result).to.deep.equal({
            project: "my-project",
            table: "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
        });
    });

    it("should reject malformed table rooms", () => {
        expect(parseRoom("/projects/my-project/tables/")).to.be.undefined;
        expect(parseRoom("/projects/my-project/pages/x")).to.be.undefined;
        expect(parseRoom("/projects/my-project/tables/bad%2Fslash")).to.be.undefined;
    });

    it("should return undefined on malformed URI components (FIXED)", () => {
        // This confirms the vulnerability is fixed.
        // We expect it to return undefined gracefully instead of throwing.
        expect(parseRoom("/projects/%")).to.be.undefined;
    });
});
