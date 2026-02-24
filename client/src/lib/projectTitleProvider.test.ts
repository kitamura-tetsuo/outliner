import { describe, it, expect, vi } from "vitest";

// Mock yjsService before importing projectTitleProvider
vi.mock("./yjsService.svelte", () => ({
    getProjectTitle: vi.fn((id) => id === "p1" ? "Project One" : "")
}));

import { getProjectTitle } from "./projectTitleProvider";

describe("projectTitleProvider", () => {
    it("should return title via yjsService if available", () => {
        expect(getProjectTitle("p1")).toBe("Project One");
    });

    it("should return empty string if not found", () => {
        expect(getProjectTitle("unknown")).toBe("");
    });
});
