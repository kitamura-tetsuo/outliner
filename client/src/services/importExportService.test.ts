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
        expect(project.items.length).toBe(1);
    });

    it("imports opml", () => {
        const project = Project.createInstance("Test");
        const xml = '<opml><body><outline text="A"><outline text="B"/></outline></body></opml>';
        importOpmlIntoProject(xml, project);
        expect(project.items.length).toBe(1);
    });

    // A page titled "-" would be unreachable through /:project/-/... routing
    // (issue: unify project-scoped management routes), so the first root
    // node's title is reallocated the same way any other name collision is,
    // instead of being created verbatim from the imported text.
    it("reallocates an imported page title of '-' away from the reserved segment", () => {
        const project = Project.createInstance("Test");
        importMarkdownIntoProject("- -\n  - child", project);
        expect(project.items.length).toBe(1);
        expect(project.items.at(0)?.text.toString()).toBe("-_2");
    });

    it("reallocates an imported OPML page title of '-' away from the reserved segment", () => {
        const project = Project.createInstance("Test");
        const xml = '<opml><body><outline text="-"><outline text="child"/></outline></body></opml>';
        importOpmlIntoProject(xml, project);
        expect(project.items.length).toBe(1);
        expect(project.items.at(0)?.text.toString()).toBe("-_2");
    });
});
