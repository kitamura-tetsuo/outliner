import { describe, expect, it } from "vitest";
import { params } from "./params";

// Runs the matcher through the Standard Schema interface SvelteKit's router
// calls (`matcher['~standard'].validate(segment)`), so a matcher that stops
// returning the slug or starts accepting other segments fails here.
function matchDemoProject(segment: string): string | undefined {
    const result = params.demoProject["~standard"].validate(segment);
    if (result instanceof Promise) throw new Error("matcher must be synchronous");
    return result.issues ? undefined : (result.value as string);
}

describe("demoProject route matcher", () => {
    it("matches the registered demo projects and keeps the slug as the param value", () => {
        expect(matchDemoProject("demo")).toBe("demo");
        expect(matchDemoProject("demo-ja")).toBe("demo-ja");
    });

    it("lets every other first segment fall through to the [project] routes", () => {
        for (const segment of ["demo-xx", "demonstration", "Demo", "projects", "settings", ""]) {
            expect(matchDemoProject(segment), segment).toBeUndefined();
        }
    });
});
