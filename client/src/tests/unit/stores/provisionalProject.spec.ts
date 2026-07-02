import { describe, expect, it } from "vitest";
import { Project } from "../../../schema/app-schema";
import { isProvisionalProject, store } from "../../../stores/store.svelte";

describe("isProvisionalProject", () => {
    it("identifies the provisional project created automatically at startup", () => {
        // store.svelte.ts creates a provisional Project as soon as it's imported in a browser-like
        // (jsdom) environment, before any real Yjs connection exists.
        expect(store.project).toBeDefined();
        expect(isProvisionalProject(store.project)).toBe(true);
    });

    it("does not flag an independently created project as provisional", () => {
        const project = Project.createInstance("Some other project");
        expect(isProvisionalProject(project)).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(isProvisionalProject(undefined)).toBe(false);
    });
});
