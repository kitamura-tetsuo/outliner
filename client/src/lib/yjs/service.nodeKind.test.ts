import { describe, expect, it } from "vitest";
import { Item } from "../../schema/app-schema";
import { safeGetNodeParent } from "../../utils/treeUtils";
import { yjsService } from "./service";

/**
 * Indent reparents an item under its preceding sibling, so it is one of the
 * structural paths that could otherwise give a Grid or Calendar leaf children
 * (#5015). The rule is the same one drag & drop applies, enforced here rather
 * than left to the renderer.
 */
describe("yjsService structural moves and node kinds (#5015)", () => {
    function project() {
        return yjsService.createProject("node-kind service tests");
    }

    function stamp(proj: ReturnType<typeof project>, key: string, componentType: string) {
        new Item(proj.ydoc, proj.tree, key).componentType = componentType;
    }

    for (const [label, componentType] of [["Grid", "yjstable"], ["Calendar", "calendar"]] as const) {
        it(`refuses to indent an item under a ${label} leaf`, () => {
            const proj = project();
            const leaf = yjsService.addItem(proj, "root", "u1");
            stamp(proj, leaf.key, componentType);
            const note = yjsService.addItem(proj, "root", "u1");
            yjsService.updateText(proj, note.key, "note");

            yjsService.indentItem(proj, note.key);

            expect(safeGetNodeParent(proj.tree, note.key)).toBe("root");
        });

        it(`refuses to move an item under a ${label} leaf`, () => {
            const proj = project();
            const leaf = yjsService.addItem(proj, "root", "u1");
            stamp(proj, leaf.key, componentType);
            const note = yjsService.addItem(proj, "root", "u1");

            yjsService.moveItem(proj, note.key, leaf.key);

            expect(safeGetNodeParent(proj.tree, note.key)).toBe("root");
        });
    }

    it("refuses to indent ordinary text into a Layout, which arranges blocks only", () => {
        const proj = project();
        const layout = yjsService.addItem(proj, "root", "u1");
        stamp(proj, layout.key, "layout");
        const note = yjsService.addItem(proj, "root", "u1");
        yjsService.updateText(proj, note.key, "note");

        yjsService.indentItem(proj, note.key);

        expect(safeGetNodeParent(proj.tree, note.key)).toBe("root");
    });

    it("still indents a block into a Layout, and any item under a Text node", () => {
        const proj = project();
        const layout = yjsService.addItem(proj, "root", "u1");
        stamp(proj, layout.key, "layout");
        const grid = yjsService.addItem(proj, "root", "u1");
        stamp(proj, grid.key, "yjstable");

        yjsService.indentItem(proj, grid.key);
        expect(safeGetNodeParent(proj.tree, grid.key)).toBe(layout.key);

        const heading = yjsService.addItem(proj, "root", "u1");
        yjsService.updateText(proj, heading.key, "Upcoming tasks");
        const child = yjsService.addItem(proj, "root", "u1");
        yjsService.updateText(proj, child.key, "child");

        yjsService.indentItem(proj, child.key);
        expect(safeGetNodeParent(proj.tree, child.key)).toBe(heading.key);
    });
});
