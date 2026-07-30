import { beforeEach, describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { Items } from "../../schema/yjs-schema";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { presenceStore } from "../../stores/PresenceStore.svelte";
import { yjsService } from "./service";

vi.mock("../../stores/PresenceStore.svelte", () => ({
    presenceStore: {
        users: {} as Record<string, unknown>,
        setUser: vi.fn(function(this: any, u: any) {
            this.users[u.userId] = u;
        }),
        removeUser: vi.fn(function(this: any, id: string) {
            delete this.users[id];
        }),
        reset: vi.fn(function(this: any) {
            this.users = {};
        }),
    },
}));

vi.mock("../../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        cursors: {} as Record<string, unknown>,
        selections: {} as Record<string, unknown>,
        setCursor: vi.fn(function(this: any, c: any) {
            this.cursors[c.userId] = c;
        }),
        setSelection: vi.fn(function(this: any, s: any) {
            this.selections[s.userId] = s;
        }),
        clearCursorAndSelection: vi.fn(function(this: any, userId: string) {
            delete this.cursors[userId];
        }),
        clearSelectionForUser: vi.fn(function(this: any, userId: string) {
            delete this.selections[userId];
        }),
        reset: vi.fn(function(this: any) {
            this.cursors = {};
            this.selections = {};
        }),
    },
}));

describe("yjsService", () => {
    beforeEach(() => {
        (presenceStore as any).reset();
        (editorOverlayStore as any).reset();
        vi.clearAllMocks();
    });

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

    it("binds project presence to store", () => {
        const awareness = new Awareness(new Y.Doc());

        const unbind = yjsService.bindProjectPresence(awareness);
        awareness.setLocalStateField("user", { userId: "u1", name: "Alice" });

        expect((presenceStore as any).users["u1"].userName).toBe("Alice");

        awareness.setLocalStateField("user", null);
        unbind();
    });

    it("binds page presence to overlay", () => {
        const awareness = new Awareness(new Y.Doc());

        const unbind = yjsService.bindPagePresence(awareness);

        // seed local state (ignored by overlay sync)
        awareness.setLocalStateField("user", { userId: "self", name: "Self" });
        awareness.setLocalStateField("presence", { cursor: { itemId: "root", offset: 0 } });

        // simulate remote collaborator
        const states = awareness.getStates();
        states.set(42, {
            user: { userId: "u2", name: "Bob" },
            presence: { cursor: { itemId: "i1", offset: 0 } },
        });
        const awarenessWithEmit = awareness as unknown as { emit: (event: string, args: unknown[]) => void; };
        awarenessWithEmit.emit("change", [
            { added: new Set([42]), updated: new Set(), removed: new Set() },
            "test",
        ]);

        const cursor = (editorOverlayStore as any).cursors["u2"];
        expect(cursor?.itemId).toBe("i1");

        awarenessWithEmit.emit("change", [
            { added: new Set(), updated: new Set(), removed: new Set([42]) },
            "test",
        ]);
        unbind();
    });
});
