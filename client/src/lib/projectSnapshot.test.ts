import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../schema/app-schema";
import { loadProjectSnapshot, saveProjectSnapshot } from "./projectSnapshot";

describe("projectSnapshot", () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        window.localStorage.clear();
    });

    it("should save and load snapshot", () => {
        // Need a real Project instance
        const project = Project.createInstance("Test Project");
        // Add some content
        project.addPage("Page 1", "test");

        saveProjectSnapshot(project);

        const snapshot = loadProjectSnapshot("Test Project");
        expect(snapshot).not.toBeNull();
        expect(snapshot?.title).toBe("Test Project");
        expect(snapshot?.items.length).toBeGreaterThan(0);
    });

    it("should return null for non-existent snapshot", () => {
        const snapshot = loadProjectSnapshot("Non Existent");
        expect(snapshot).toBeNull();
    });

    it("should handle empty project save", () => {
        saveProjectSnapshot(undefined);
        expect(loadProjectSnapshot("")).toBeNull();
    });
});

import { snapshotToMarkdown, snapshotToOpml } from "./projectSnapshot";
import type { ProjectSnapshot } from "./projectSnapshot";

describe("snapshot conversion", () => {
    const mockSnapshot: ProjectSnapshot = {
        title: "Test",
        items: [
            {
                text: "Item 1",
                children: [
                    { text: "Child 1", children: [] },
                ],
            },
        ],
    };

    it("should convert to markdown", () => {
        const md = snapshotToMarkdown(mockSnapshot);
        expect(md).toContain("- Item 1");
        expect(md).toContain("  - Child 1");
    });

    it("should convert to opml", () => {
        const opml = snapshotToOpml(mockSnapshot);
        expect(opml).toContain('<outline text="Item 1">');
        expect(opml).toContain('<outline text="Child 1">');
    });
});
