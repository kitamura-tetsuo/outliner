import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Item, Project } from "../schema/app-schema";
import { registerEditorSurface } from "../services/editorSurface";

// Store-only mocks control the invoking surface and cursor; creation uses real Yjs trees.
const state = vi.hoisted(() => ({
    project: undefined as Project | undefined,
    currentPage: undefined as Item | undefined,
    target: undefined as Item | undefined,
    syncError: null as string | null,
}));
vi.mock("./store.svelte", () => ({ store: state }));
vi.mock("./yjsStore.svelte", () => ({
    yjsStore: {
        get currentProjectId() {
            return state.project?.ydoc.guid;
        },
        get syncError() {
            return state.syncError;
        },
    },
}));
const cursor = vi.hoisted(() => ({
    itemId: "",
    offset: 0,
    userId: "tester",
    applyToStore() {},
    findTarget: () => state.target,
}));
vi.mock("./EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        getCursorInstances: () => [cursor],
        getLocalCursorInstances: () => [cursor],
        clearCursorAndSelection() {},
        setActiveItem() {},
        startCursorBlink() {},
    },
}));
import { commandPaletteStore } from "./CommandPaletteStore.svelte";

beforeEach(() => {
    state.project = Project.createInstance("Slash Kanban");
    state.currentPage = state.project.addPage("Page", "tester");
    state.target = state.currentPage.items.addNode("tester");
    state.target.updateText("/kanban");
    state.syncError = null;
    cursor.itemId = state.target.id;
    cursor.offset = 0;
    commandPaletteStore.hide();
});

function openKanbanCommand() {
    commandPaletteStore.show(false);
    cursor.offset = 7;
    commandPaletteStore.updateQuery("kanban");
}

describe("production Kanban slash command", () => {
    it("discovers and confirms an unbound placement without creating definitions", () => {
        openKanbanCommand();
        const stop = registerEditorSurface(() => true);
        try {
            expect(commandPaletteStore.visible.map(command => command.type)).toEqual(["kanban"]);
            commandPaletteStore.confirm();
            const items = [...state.currentPage!.items];
            expect(items).toHaveLength(1);
            expect(items[0].componentType).toBe("kanban");
            expect(state.project!.ydoc.getMap("yjsKanbans").size).toBe(0);
            expect(state.project!.ydoc.getMap("yjsTables").size).toBe(0);
            expect(state.project!.ydoc.getMap("yjsGrids").size).toBe(0);
        } finally {
            stop();
        }
    });
    it("checks admission and surface writes before removing the command text", () => {
        openKanbanCommand();
        let writable = false;
        const stop = registerEditorSurface(() => writable);
        try {
            for (const denied of [false, true]) {
                writable = denied;
                state.syncError = denied ? "denied" : null;
                const before = state.project!.ydoc.toJSON();
                commandPaletteStore.insert("kanban");
                expect(String(state.target!.text)).toBe("/kanban");
                expect(state.project!.ydoc.toJSON()).toEqual(before);
            }
        } finally {
            stop();
        }
    });
});
