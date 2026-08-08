import { describe, expect, it } from "vitest";
import { DEMO_PROJECT_NAME } from "./demoSeed";
import { isPublicProject } from "./publicProject";

describe("isPublicProject", () => {
    it("treats the demo project as public", () => {
        expect(isPublicProject(DEMO_PROJECT_NAME)).toBe(true);
        expect(isPublicProject("demo")).toBe(true);
    });

    it("treats every other project as private", () => {
        expect(isPublicProject("my-project")).toBe(false);
        expect(isPublicProject("Demo")).toBe(false);
        expect(isPublicProject("demo-2")).toBe(false);
        expect(isPublicProject("")).toBe(false);
        expect(isPublicProject(undefined)).toBe(false);
    });
});
