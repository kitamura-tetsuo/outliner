import { beforeEach, describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { Items } from "../../schema/yjs-schema";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { presenceStore } from "../../stores/PresenceStore.svelte";
import { yjsService } from "./service";

vi.mock("../../stores/PresenceStore.svelte", () => {
    const store = {
        users: {} as Record<string, unknown>,
        setUser: vi.fn((u: { userId: string; }) => {
            store.users[u.userId] = u;
        }),
        removeUser: vi.fn((id: string) => {
            delete store.users[id];
        }),
        reset: vi.fn(() => {
            store.users = {};
        }),
    };
    return { presenceStore: store };
});

vi.mock("../../stores/EditorOverlayStore.svelte", () => {
    const store = {
        cursors: {} as Record<string, unknown>,
        selections: {} as Record<string, unknown>,
        setCursor: vi.fn((c: { userId: string; }) => {
            store.cursors[c.userId] = c;
        }),
        setSelection: vi.fn((s: { userId: string; }) => {
            store.selections[s.userId] = s;
        }),
        clearCursorAndSelection: vi.fn((userId: string) => {
            delete store.cursors[userId];
        }),
        clearSelectionForUser: vi.fn((userId: string) => {
            delete store.selections[userId];
        }),
        reset: vi.fn(() => {
            store.cursors = {};
            store.selections = {};
        }),
    };
    return { editorOverlayStore: store };
});

describe("yjsService", () => {
    beforeEach(() => {
        (presenceStore as unknown as { reset: () => void; users: Record<string, { userName?: string; }>; }).reset();
        (editorOverlayStore as unknown as { reset: () => void; cursors: Record<string, { itemId: string; }>; }).reset();
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

        expect(
            (presenceStore as unknown as { reset: () => void; users: Record<string, { userName?: string; }>; })
                .users["u1"].userName,
        ).toBe("Alice");

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

        const cursor =
            (editorOverlayStore as unknown as { reset: () => void; cursors: Record<string, { itemId: string; }>; })
                .cursors["u2"];
        expect(cursor?.itemId).toBe("i1");

        awarenessWithEmit.emit("change", [
            { added: new Set(), updated: new Set(), removed: new Set([42]) },
            "test",
        ]);
        unbind();
    });
});
