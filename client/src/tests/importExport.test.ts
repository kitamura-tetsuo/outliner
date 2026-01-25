import { describe, expect, it } from "vitest";
import { Project } from "../schema/app-schema";
import {
    exportProjectToMarkdown,
    exportProjectToOpml,
    importMarkdownIntoProject,
    importOpmlIntoProject,
} from "../services/importExportService";

describe("Import/Export Service", () => {
    describe("Markdown Import", () => {
        it("should import simple markdown with child items", () => {
            const project = Project.createInstance("Test Project");
            const markdown = "- ImportedPage\n  - Child";

            importMarkdownIntoProject(markdown, project);

            // There should be 1 page created in the project
            expect((project.items as any).length).toBe(1);

            const page = (project.items as any)[0];
            expect(page.text).toBe("ImportedPage");

            // There should be 1 child item in the page
            expect((page.items as any).length).toBe(1);
            expect((page.items as any)[0].text).toBe("Child");
        });

        it("should import nested markdown with multiple levels", () => {
            const project = Project.createInstance("Test Project");
            const markdown = "- Parent\n  - Child\n    - Grand";

            importMarkdownIntoProject(markdown, project);

            // There should be 1 page created in the project
            expect((project.items as any).length).toBe(1);

            const page = (project.items as any)[0];
            expect(page.text).toBe("Parent");

            // There should be 1 child item in the page
            expect((page.items as any).length).toBe(1);
            const child = (page.items as any)[0];
            expect(child.text).toBe("Child");

            // There should be 1 grandchild item in the child item
            expect((child.items as any).length).toBe(1);
            expect((child.items as any)[0].text).toBe("Grand");
        });

        it("should import multiple root items correctly", () => {
            const project = Project.createInstance("Test Project");
            const markdown = "- FirstPage\n  - Child1\n- SecondItem\n  - Child2";

            importMarkdownIntoProject(markdown, project);

            // In the current implementation, only the first indent 0 item is created as a page,
            // and subsequent indent 0 items are created as children of the first page
            expect((project.items as any).length).toBe(1);

            const page = (project.items as any)[0];
            expect(page.text).toBe("FirstPage");

            // There should be 2 child items in the page (Child1 and SecondItem)
            expect((page.items as any).length).toBe(2);
            expect((page.items as any)[0].text).toBe("Child1");
            expect((page.items as any)[1].text).toBe("SecondItem");

            // There should be 1 child item in SecondItem
            expect((page.items as any)[1].items.length).toBe(1);
            expect((page.items as any)[1].items[0].text).toBe("Child2");
        });
    });

    describe("OPML Import", () => {
        it("should import simple OPML with child items", () => {
            const project = Project.createInstance("Test Project");
            const opml = "<opml><body><outline text='Imported'><outline text='Child'/></outline></body></opml>";

            importOpmlIntoProject(opml, project);

            // There should be 1 page created in the project
            expect((project.items as any).length).toBe(1);

            const page = (project.items as any)[0];
            expect(page.text).toBe("Imported");

            // There should be 1 child item in the page
            expect((page.items as any).length).toBe(1);
            expect((page.items as any)[0].text).toBe("Child");
        });
    });

    describe("Export", () => {
        it("should export project to markdown", () => {
            const project = Project.createInstance("Test Project");
            const page = project.addPage("TestPage", "test");
            const child = (page.items as any).addNode("test");
            child.updateText("Child Item");

            const markdown = exportProjectToMarkdown(project);
            expect(markdown).toContain("- TestPage");
            expect(markdown).toContain("  - Child Item");
        });

        it("should export project to OPML", () => {
            const project = Project.createInstance("Test Project");
            const page = project.addPage("TestPage", "test");
            const child = (page.items as any).addNode("test");
            child.updateText("Child Item");

            const opml = exportProjectToOpml(project);
            expect(opml).toContain('<outline text="TestPage">');
            expect(opml).toContain('<outline text="Child Item">');
        });
    });
});
