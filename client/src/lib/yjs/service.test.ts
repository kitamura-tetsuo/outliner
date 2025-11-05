import { describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { Items } from "../../schema/yjs-schema";
import { yjsService } from "./service";

interface TestUser {
    userId: string;
    userName: string;
}

interface TestPresenceStore {
    users: Record<string, TestUser>;
    setUser(user: TestUser): void;
    removeUser(id: string): void;
}

interface TestCursor {
    itemId: string;
    offset: number;
    userId: string;
}

interface TestOverlayStore {
    cursors: Record<string, TestCursor>;
    selections: Record<string, { userId: string; }>;
    setCursor(cursor: TestCursor): void;
    setSelection(selection: { userId: string; }): void;
    clearCursorAndSelection(userId: string): void;
    clearSelectionForUser(userId: string): void;
}

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

    it("binds project presence to store", () => {
        const awareness = new Awareness(new Y.Doc());
        // Provide a minimal global presence store to avoid importing .svelte.ts
        const presenceStore: TestPresenceStore = {
            users: {},
            setUser(u: TestUser) {
                this.users = { ...this.users, [u.userId]: u };
            },
            removeUser(id: string) {
                const updatedUsers = { ...this.users };
                delete updatedUsers[id];
                this.users = updatedUsers;
            },
        };
        (globalThis as typeof globalThis & { presenceStore?: TestPresenceStore; }).presenceStore = presenceStore;
        const unbind = yjsService.bindProjectPresence(awareness);
        awareness.setLocalStateField("user", { userId: "u1", name: "Alice" });
        expect(presenceStore.users["u1"].userName).toBe("Alice");
        awareness.setLocalStateField("user", null);
        unbind();
    });

    it("binds page presence to overlay", () => {
        const awareness = new Awareness(new Y.Doc());
        // Provide a minimal global overlay store
        const editorOverlayStore: TestOverlayStore = {
            cursors: {},
            selections: {},
            setCursor({ itemId, offset, userId }: TestCursor) {
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
        (globalThis as typeof globalThis & { editorOverlayStore?: TestOverlayStore; }).editorOverlayStore =
            editorOverlayStore;
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

        const cursor = Object.values(editorOverlayStore.cursors).find(c => c.userId === "u2");
        expect(cursor?.itemId).toBe("i1");

        unbind();
    });
});
