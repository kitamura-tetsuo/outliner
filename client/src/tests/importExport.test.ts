import { describe, expect, it } from "vitest";
import { Project } from "../schema/app-schema";
import type { Item } from "../schema/app-schema";
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

            // プロジェクトに1つのページが作成されているはず
            expect(project.items.length).toBe(1);

            const page = project.items.at(0) as Item;
            expect(page.text).toBe("ImportedPage");

            // ページに1つの子アイテムがあるはず
            expect(page.items.length).toBe(1);
            expect(page.items.at(0)?.text).toBe("Child");
        });

        it("should import nested markdown with multiple levels", () => {
            const project = Project.createInstance("Test Project");
            const markdown = "- Parent\n  - Child\n    - Grand";

            importMarkdownIntoProject(markdown, project);

            // プロジェクトに1つのページが作成されているはず
            expect(project.items.length).toBe(1);

            const page = project.items.at(0) as Item;
            expect(page.text).toBe("Parent");

            // ページに1つの子アイテムがあるはず
            expect(page.items.length).toBe(1);
            const child = page.items.at(0) as Item;
            expect(child.text).toBe("Child");

            // 子アイテムに1つの孫アイテムがあるはず
            expect(child.items.length).toBe(1);
            expect(child.items.at(0)?.text).toBe("Grand");
        });

        it("should import multiple root items correctly", () => {
            const project = Project.createInstance("Test Project");
            const markdown = "- FirstPage\n  - Child1\n- SecondItem\n  - Child2";

            importMarkdownIntoProject(markdown, project);

            // 現在の実装では、最初のインデント0アイテムのみがページとして作成され、
            // 2番目以降のインデント0アイテムは最初のページの子として作成される
            expect(project.items.length).toBe(1);

            const page = project.items.at(0) as Item;
            expect(page.text).toBe("FirstPage");

            // ページに2つの子アイテムがあるはず（Child1とSecondItem）
            expect(page.items.length).toBe(2);
            expect(page.items.at(0)?.text).toBe("Child1");
            expect(page.items.at(1)?.text).toBe("SecondItem");

            // SecondItemに1つの子アイテムがあるはず
            expect(page.items.at(1)?.items.length).toBe(1);
            expect(page.items.at(1)?.items.at(0)?.text).toBe("Child2");
        });
    });

    describe("OPML Import", () => {
        it("should import simple OPML with child items", () => {
            const project = Project.createInstance("Test Project");
            const opml = "<opml><body><outline text='Imported'><outline text='Child'/></outline></body></opml>";

            importOpmlIntoProject(opml, project);

            // プロジェクトに1つのページが作成されているはず
            expect(project.items.length).toBe(1);

            const page = project.items.at(0) as Item;
            expect(page.text).toBe("Imported");

            // ページに1つの子アイテムがあるはず
            expect(page.items.length).toBe(1);
            expect(page.items.at(0)?.text).toBe("Child");
        });
    });

    describe("Export", () => {
        it("should export project to markdown", () => {
            const project = Project.createInstance("Test Project");
            const page = project.addPage("TestPage", "test");
            const child = page.items.addNode("test");
            child.updateText("Child Item");

            const markdown = exportProjectToMarkdown(project);
            expect(markdown).toContain("- TestPage");
            expect(markdown).toContain("  - Child Item");
        });

        it("should export project to OPML", () => {
            const project = Project.createInstance("Test Project");
            const page = project.addPage("TestPage", "test");
            const child = page.items.addNode("test");
            child.updateText("Child Item");

            const opml = exportProjectToOpml(project);
            expect(opml).toContain('<outline text="TestPage">');
            expect(opml).toContain('<outline text="Child Item">');
        });
    });
});
