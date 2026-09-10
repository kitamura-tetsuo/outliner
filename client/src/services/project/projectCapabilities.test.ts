import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import { getProjectCapabilities } from "./projectCapabilities";

describe("projectCapabilities (#5310, REQ-008)", () => {
    it("grants no capability at all for an absent project", () => {
        expect(getProjectCapabilities(undefined)).toEqual({ canRead: false, canWrite: false });
    });

    it("grants both capabilities for a project with a usable Y.Doc", () => {
        const project = Project.createInstance("Test");
        expect(getProjectCapabilities(project)).toEqual({ canRead: true, canWrite: true });
    });
});
