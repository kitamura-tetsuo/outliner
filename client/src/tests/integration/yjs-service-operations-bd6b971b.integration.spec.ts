import { describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { yjsService } from "../../lib/yjs/service";

type ParentReadableTree = {
    getNodeParentFromKey(key: string): string | undefined;
};

describe("Yjs service basic operations", () => {
    it("performs CRUD and presence updates", () => {
        const project = yjsService.createProject("integration");

        const first = yjsService.addItem(project, "root", "u1");
        yjsService.updateText(project, first.key, "A");

        const second = yjsService.addItem(project, "root", "u1");
        yjsService.updateText(project, second.key, "B");

        yjsService.reorderItem(project, second.key, 0);
        expect(project.items.at(0)?.id).toBe(second.id);

        yjsService.reorderItem(project, second.key, 1);
        expect(project.items.at(1)?.id).toBe(second.id);

        yjsService.indentItem(project, second.key);
        const tree = project.tree as unknown as ParentReadableTree;
        expect(tree.getNodeParentFromKey(second.key)).toBe(first.key);

        yjsService.outdentItem(project, second.key);
        expect(tree.getNodeParentFromKey(second.key)).toBe("root");
        expect(project.items.length).toBe(2);

        yjsService.removeItem(project, first.key);
        expect(project.items.length).toBe(1);

        const awareness = new Awareness(new Y.Doc());
        yjsService.setPresence(awareness, { cursor: { itemId: second.key, offset: 1 } });
        const presence = yjsService.getPresence(awareness);
        expect(presence?.cursor?.itemId).toBe(second.key);
    });
});
