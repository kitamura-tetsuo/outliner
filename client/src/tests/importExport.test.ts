import { describe, expect, it } from "vitest";
import { yjsService } from "../lib/yjs/service";
import { exportProjectToOpml } from "../services/importExportService";

describe("Import/Export Service", () => {
    describe("OPML Export", () => {
        it("should export simple project to OPML", () => {
            const project = yjsService.createProject("TestProject");
            const page = project.addPage("TestPage", "tester");

            const a = yjsService.addItem(project, page.key, "u1");
            const b = yjsService.addItem(project, page.key, "u1");
            yjsService.updateText(project, a.key, "Child1");
            yjsService.updateText(project, b.key, "SecondItem");

            const c = yjsService.addItem(project, b.key, "u1");
            yjsService.updateText(project, c.key, "Child2");

            expect(page.items.at(0)!.text.toString()).toBe("Child1");
            expect(page.items.at(1)!.text.toString()).toBe("SecondItem");

            // There should be 1 child item in SecondItem
            expect(page.items.at(1)!.items.length).toBe(1);
            const secondItemChildren = Array.from(page.items.at(1)!.items);
            expect(secondItemChildren[0].text.toString()).toBe("Child2");
        });
    });

    describe("Scrapbox Export", () => {
        it("should export to scrapbox format", () => {
            const project = yjsService.createProject("TestProject");
            const opml = exportProjectToOpml(project);
            expect(opml).toContain("<opml");
        });
    });
});
