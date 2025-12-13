import { describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { Items } from "../../schema/yjs-schema";
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
        expect(presence.cursor.itemId).toBe("i1");
    });

    it("binds project presence to store", () => {
        const awareness = new Awareness(new Y.Doc());
        // Provide a minimal global presence store to avoid importing .svelte.ts
        const presenceStore = {
            users: {} as Record<string, unknown>,
            setUser(u: { userId: string; [key: string]: unknown; }) {
                this.users = { ...this.users, [u.userId]: u };
            },
            removeUser(id: string) {
                const updatedUsers = { ...this.users };
                delete updatedUsers[id];
                this.users = updatedUsers;
            },
        };
        (globalThis as any).presenceStore = presenceStore;
        const unbind = yjsService.bindProjectPresence(awareness);
        awareness.setLocalStateField("user", { userId: "u1", name: "Alice" });
        expect((presenceStore.users["u1"] as any).userName).toBe("Alice");
        awareness.setLocalStateField("user", null);
        unbind();
    });

    it("binds page presence to overlay", () => {
        const awareness = new Awareness(new Y.Doc());
        // Provide a minimal global overlay store
        type CursorState = { itemId: string; offset: number; userId: string; };
        const editorOverlayStore = {
            cursors: {} as Record<string, CursorState>,
            selections: {} as Record<string, unknown>,
            setCursor({ itemId, offset, userId }: { itemId: string; offset: number; userId: string; }) {
                this.cursors[userId] = { itemId, offset, userId };
            },
            setSelection({ userId }: { userId: string; }) {
                this.selections[userId] = { userId };
            },
            clearCursorAndSelection(userId: string) {
                const updatedCursors = { ...this.cursors };
                delete updatedCursors[userId];
                this.cursors = updatedCursors;
            },
            clearSelectionForUser(userId: string) {
                const updatedSelections = { ...this.selections };
                delete updatedSelections[userId];
                this.selections = updatedSelections;
            },
        };
        (globalThis as any).editorOverlayStore = editorOverlayStore;
        const unbind = yjsService.bindPagePresence(awareness);

        // seed local state (ignored by overlay sync)
        awareness.setLocalStateField("user", { userId: "self", name: "Self" });
        awareness.setLocalStateField("presence", { cursor: { itemId: "root", offset: 0 } });

        // simulate remote collaborator
        const states = (awareness as any).getStates();
        states.set(42, {
            user: { userId: "u2", name: "Bob" },
            presence: { cursor: { itemId: "i1", offset: 0 } },
        });
        (awareness as any).emit("change", [{ added: new Set([42]), updated: new Set(), removed: new Set() }, "test"]);

        const cursor = Object.values(editorOverlayStore.cursors).find(c => c.userId === "u2");
        expect(cursor?.itemId).toBe("i1");

        (awareness as any).emit("change", [{ added: new Set(), updated: new Set(), removed: new Set([42]) }, "test"]);
        unbind();
    });
});
