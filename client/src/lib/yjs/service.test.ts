import { describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { Items } from "../../schema/yjs-schema";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { presenceStore } from "../../stores/PresenceStore.svelte";
import { store as appStore } from "../../stores/store.svelte";
import { yjsService } from "./service";

describe("yjsService", () => {
    it("adds and reorders items", () => {
        const project = yjsService.createProject("test");
        const a = yjsService.addItem(project, "root", "u1");
        const b = yjsService.addItem(project, "root", "u1");
        yjsService.updateText(project, a.key, "A");
        yjsService.updateText(project, b.key, "B");
        yjsService.reorderItem(project, b.key, 0);
        expect(project.items.at(0)?.id).toBe(b.id);
        expect(project.items.length).toBe(2);
    });

    it("indents and outdents items", () => {
        const project = yjsService.createProject("test");
        const a = yjsService.addItem(project, "root", "u1");
        const b = yjsService.addItem(project, "root", "u1");
        yjsService.indentItem(project, b.key);
        const children = new Items(project.ydoc, project.tree, a.key);
        expect(children.length).toBe(1);
        yjsService.outdentItem(project, b.key);
        expect(project.items.length).toBe(2);
    });

    it("sets presence state", () => {
        const awareness = new Awareness(new Y.Doc());
        yjsService.setPresence(awareness, { cursor: { itemId: "i1", offset: 0 } });
        const presence = yjsService.getPresence(awareness);
        expect(presence?.cursor?.itemId).toBe("i1");
    });

    it("binds project presence to store", async () => {
        const awareness = new Awareness(new Y.Doc());
        presenceStore.reset();

        const unbind = yjsService.bindProjectPresence(awareness);

        // mock remote change emit
        const awarenessWithEmit = awareness as unknown as { emit: (event: string, args: unknown[]) => void; };

        // We can just add a state via internal mechanisms then trigger the event
        awareness.getStates().set(1, { user: { userId: "u1", name: "Alice" } });
        awarenessWithEmit.emit("change", [
            { added: [1], updated: [], removed: [] },
            "test",
        ]);

        await new Promise(r => setTimeout(r, 10));

        const userList = Object.values(presenceStore.users);
        expect(userList).toHaveLength(1);
        expect(userList.find(u => u.userId === "u1")?.userName).toBe("Alice");

        awarenessWithEmit.emit("change", [
            { added: [], updated: [], removed: [1] },
            "test",
        ]);
        unbind();
    });

    it("binds page presence to overlay", async () => {
        const awareness = new Awareness(new Y.Doc());
        Object.keys(editorOverlayStore.cursors).forEach(k => delete editorOverlayStore.cursors[k]);

        const unbind = yjsService.bindPagePresence(awareness);

        appStore.currentPage = { id: "test-page" } as unknown as import("../../schema/yjs-schema").Item;

        const awarenessWithEmit = awareness as unknown as { emit: (event: string, args: unknown[]) => void; };

        awareness.getStates().set(
            42,
            {
                user: { userId: "u2", name: "Bob" },
                presence: { cursor: { itemId: "i1", offset: 0 } },
                pageId: "test-page",
            } as unknown as {
                user: { userId: string; name: string; color?: string; };
                presence?: { cursor: { itemId: string; offset: number; }; };
                pageId?: string;
            },
        );

        awarenessWithEmit.emit("change", [
            { added: [42], updated: [], removed: [] },
            "test",
        ]);

        await new Promise(r => setTimeout(r, 10));

        const cursor = Object.values(editorOverlayStore.cursors).find((c: unknown) =>
            (c as { userId: string; }).userId === "u2"
        ) as { itemId: string; } | undefined;

        expect(cursor?.itemId).toBe("i1");

        awarenessWithEmit.emit("change", [
            { added: [], updated: [], removed: [42] },
            "test",
        ]);

        await new Promise(r => setTimeout(r, 10));

        expect(
            Object.values(editorOverlayStore.cursors).find((c: unknown) => (c as { userId: string; }).userId === "u2"),
        ).toBeUndefined();
        unbind();
    });
});
