import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Project } from "./app-schema";

describe("Project page subdocs", () => {
    it("creates a subdoc for each page", () => {
        const project = Project.createInstance("test");
        const page = project.addPage("page1", "u1");
        const pages = project.ydoc.getMap("pages");
        const sub = pages.get(page.id);
        expect(sub).toBeInstanceOf(Y.Doc);
        expect((sub as Y.Doc).guid).toBe(page.id);
    });
});
