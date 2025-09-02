import { describe, expect, it } from "vitest";
import { yjsService } from "../../lib/yjs/service";
import { Items } from "../../schema/app-schema";

describe("yjsService integration", () => {
    it("moves items between parents", () => {
        const project = yjsService.createProject("p");
        const parent = yjsService.addItem(project, "root", "u1");
        const child = yjsService.addItem(project, "root", "u1");
        yjsService.moveItem(project, child.key, parent.key);
        const children = new Items(project.ydoc, project.tree, parent.key);
        expect(children.length).toBe(1);
    });
});
