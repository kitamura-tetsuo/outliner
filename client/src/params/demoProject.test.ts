import { describe, expect, it } from "vitest";
import { match } from "./demoProject";

describe("demoProject route matcher", () => {
    it("matches the registered demo projects", () => {
        expect(match("demo")).toBe(true);
    });

    it("lets every other first segment fall through to the [project] routes", () => {
        for (const segment of ["demo-xx", "demonstration", "Demo", "projects", "settings", ""]) {
            expect(match(segment), segment).toBe(false);
        }
    });
});
