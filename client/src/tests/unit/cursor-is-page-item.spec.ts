import { describe, expect, it } from "vitest";
import { isPageItem } from "../../lib/Cursor";
import { Project } from "../../schema/yjs-schema";

describe("isPageItem", () => {
    it("detects root level items as pages", () => {
        const project = Project.createInstance("test");
        const page = project.items.addNode("u1");
        const child = page.items.addNode("u1");
        expect(isPageItem(page)).toBe(true);
        expect(isPageItem(child)).toBe(false);
    });
});
