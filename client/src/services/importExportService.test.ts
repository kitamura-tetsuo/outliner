// @ts-nocheck
import { describe, expect, it } from "vitest";
import { Project } from "../schema/app-schema";
import {
    exportProjectToMarkdown,
    exportProjectToOpml,
    importMarkdownIntoProject,
    importOpmlIntoProject,
} from "./importExportService";

function setupProject() {
    const project = Project.createInstance("Test");
    const page = project.addPage("Page 1", "user");
    page.items.addNode("user").updateText("child");
    return project;
}

describe("importExportService", () => {
    it("exports markdown", () => {
        const project = setupProject();
        const md = exportProjectToMarkdown(project);
        expect(md).toContain("- Page 1");
    });

    it("exports opml", () => {
        const project = setupProject();
        const opml = exportProjectToOpml(project);
        expect(opml).toContain("<opml");
        expect(opml).toContain("outline");
    });

    it("imports markdown", () => {
        const project = Project.createInstance("Test");
        importMarkdownIntoProject("- A\n  - B", project);
        expect((project.items as any).length).toBe(1);
    });

    it("imports opml", () => {
        const project = Project.createInstance("Test");
        const xml = '<opml><body><outline text="A"><outline text="B"/></outline></body></opml>';
        importOpmlIntoProject(xml, project);
        expect((project.items as any).length).toBe(1);
    });
});
