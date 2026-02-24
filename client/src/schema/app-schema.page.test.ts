import { describe, expect, it } from "vitest";
import { Project } from "./app-schema";

describe("Project pages", () => {
    it("adds a page to the project items collection", () => {
        const project = Project.createInstance("test");
        const page = project.addPage("page1", "u1");

        // Check that the page is in the items collection
        const items = project.items;
        expect(items.length).toBe(1);
        expect(items.at(0)?.id).toBe(page.id);
        // text is a Y.Text, so we check toString()
        expect(items.at(0)?.text.toString()).toBe("page1");
    });
});
