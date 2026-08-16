import { describe, expect, it } from "vitest";
import { demoProjectFromPath, isPublicProject, projectBasePath, projectPagePath } from "./publicProject";

describe("isPublicProject", () => {
    it("accepts the registered demo projects", () => {
        expect(isPublicProject("demo")).toBe(true);
    });

    it("rejects anything that merely looks like one", () => {
        // These all survive a startsWith("demo") test, which is what the demo
        // predicate used to be in several components.
        for (const name of ["demonstration", "demo-xx", "Demo", "", undefined]) {
            expect(isPublicProject(name), String(name)).toBe(false);
        }
    });
});

describe("projectBasePath", () => {
    it("keeps the demo's published URLs byte-identical", () => {
        expect(projectBasePath("demo")).toBe("/demo");
        expect(projectPagePath("demo", "Formatting")).toBe("/demo/Formatting");
    });

    it("uses the same shape for every project", () => {
        // A demo's slug *is* its URL segment, so there is no special case left.
        expect(projectBasePath("My Project")).toBe("/My%20Project");
        expect(projectPagePath("demo-ja", "書式")).toBe("/demo-ja/%E6%9B%B8%E5%BC%8F");
    });
});

describe("demoProjectFromPath", () => {
    it("resolves the owning demo from the first segment", () => {
        expect(demoProjectFromPath("/demo")).toBe("demo");
        expect(demoProjectFromPath("/demo/Formatting")).toBe("demo");
        expect(demoProjectFromPath("/demo/Formatting/diff")).toBe("demo");
        expect(demoProjectFromPath("/demo/%E6%9B%B8%E5%BC%8F")).toBe("demo");
    });

    it("does not match on a prefix", () => {
        expect(demoProjectFromPath("/demonstration")).toBeUndefined();
        expect(demoProjectFromPath("/demonstration/page")).toBeUndefined();
        expect(demoProjectFromPath("/")).toBeUndefined();
        expect(demoProjectFromPath("")).toBeUndefined();
    });
});
