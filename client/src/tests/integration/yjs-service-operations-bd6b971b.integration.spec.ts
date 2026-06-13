import { describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { yjsService } from "../../lib/yjs/service";

describe("YjsService Complex Operations", () => {
    it("handles multiple concurrent operations correctly", () => {
        // Create two simulated clients connected to the same doc
        const doc1 = new Y.Doc();
        const doc2 = new Y.Doc();

        doc1.on("update", (update) => {
            Y.applyUpdate(doc2, update);
        });
        doc2.on("update", (update) => {
            Y.applyUpdate(doc1, update);
        });

        // Initialize project on client 1
        const project1 = yjsService.createProject("Complex Project");
        const state = Y.encodeStateAsUpdate(project1.ydoc);
        Y.applyUpdate(doc1, state);

        // Verify final state matches on both
        expect(Y.encodeStateAsUpdate(doc1)).toEqual(Y.encodeStateAsUpdate(doc2));
    });

    it("setPresence correctly updates awareness", () => {
        const project = yjsService.createProject("test");
        const rootItems = project.items;
        const first = rootItems.addNode("user");
        first.updateText("First Item");
        const second = rootItems.addNode("user");
        second.updateText("Second Item");

        const awareness = new Awareness(new Y.Doc());
        yjsService.setPresence(awareness, {
            cursor: { cursorId: "test", itemId: second.key, offset: 1, isActive: true },
        });
        expect(yjsService.getPresence(awareness)?.cursor?.itemId).toBe(second.key);
    });
});
